import express from './mini-express.js';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import db from './db.js';

const app = express();
const SESSION_HOURS = Number(Deno.env.get('HRMS_SESSION_HOURS') || 12);
const ROLES = ['admin','hr','chairman','ceo','official','manager','employee'];
const ACCESS_MODULES = ['dashboard','employees','organization','attendance','tasks','leave','performance','reports','requisitions','conveyance','salary','funds','letters','events','administration'];

app.use((req,res,next)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','SAMEORIGIN');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  res.setHeader('Cache-Control','no-store');
  next();
});
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

function cookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').map(v => v.trim()).filter(Boolean).map(v => {
    const idx = v.indexOf('=');
    return [decodeURIComponent(v.slice(0, idx)), decodeURIComponent(v.slice(idx + 1))];
  }));
}
function now() { return new Date().toISOString(); }
function cleanText(v, fallback = null) {
  if (v === undefined || v === null || v === '') return fallback;
  return String(v).trim();
}
function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === actual.length && crypto.timingSafeEqual(actual, expected);
}
function localDate() {
  return new Intl.DateTimeFormat('en-CA',{timeZone:Deno.env.get('HRMS_TIMEZONE')||'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
}
function localTime() {
  return new Intl.DateTimeFormat('en-GB',{timeZone:Deno.env.get('HRMS_TIMEZONE')||'Asia/Dhaka',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date());
}
function sendDbError(res, err) {
  console.error(err);
  if (err && err.code === '23505') return res.status(409).json({ error: 'A record with the same unique value already exists' });
  if (err && err.code === '23503') return res.status(409).json({ error: 'This record is linked to another record and cannot be changed that way' });
  return res.status(500).json({ error: 'Server error' });
}
async function audit(userId, action, entity, entityId, details = null) {
  try {
    await db.run('INSERT INTO audit_logs(user_id,action,entity,entity_id,details,created_at) VALUES(?,?,?,?,?,?)', userId || null, action, entity, entityId == null ? null : String(entityId), details ? JSON.stringify(details) : null, now());
  } catch (e) { console.error('Audit write failed', e); }
}
async function notifyRoles(roles, title, message, entity, entityId) {
  try {
    const users = await db.all(`SELECT id FROM users WHERE status='active' AND role IN (${placeholders(roles)})`, ...roles);
    for (const user of users) await db.run('INSERT INTO notifications(user_id,title,message,entity,entity_id,created_at) VALUES(?,?,?,?,?,?)', user.id, title, message, entity, entityId == null ? null : String(entityId), now());
  } catch (e) { console.error('Notification write failed', e); }
}
async function sessionUser(req) {
  const token = cookies(req).ir_hrms_session;
  if (!token) return null;
  const row = await db.get(`SELECT u.id,u.employee_id,u.email,u.role,u.status,e.name,e.designation,
    COALESCE((SELECT json_agg(json_build_object('module',ua.module,'can_view',ua.can_view,'can_create',ua.can_create,'can_edit',ua.can_edit,'can_delete',ua.can_delete,'can_approve',ua.can_approve,'data_scope',ua.data_scope)) FROM user_access ua WHERE ua.user_id=u.id),'[]'::json) access
    FROM sessions s JOIN users u ON u.id=s.user_id LEFT JOIN employees e ON e.id=u.employee_id
    WHERE s.token=? AND s.expires_at>? AND u.status='active'`, token, now());
  return row || null;
}
async function requireAuth(req, res, next) {
  try {
    const user = await sessionUser(req);
    if (!user) return res.status(401).json({ error: 'Authentication required' });
    req.user = user;
    next();
  } catch (e) { sendDbError(res, e); }
}
function allow(...roles) {
  return (req, res, next) => roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Permission denied' });
}
const ROLE_ACCESS = {
  admin: { view: ACCESS_MODULES, create: ACCESS_MODULES, edit: ACCESS_MODULES, delete: ACCESS_MODULES, approve: ACCESS_MODULES },
  hr: { view: ACCESS_MODULES, create: ['employees','organization','attendance','tasks','leave','performance','requisitions','conveyance','salary','funds','letters','reports'], edit: ['employees','organization','attendance','tasks','leave','performance','requisitions','conveyance','salary','funds','letters'], approve: ['leave','requisitions','conveyance','funds'], delete: [] },
  chairman: { view: ['dashboard','attendance','tasks','events','reports'], create: ['attendance','tasks'], edit: ['attendance','tasks'], delete: [], approve: ['leave','requisitions','conveyance','funds'] },
  ceo: { view: ['dashboard','tasks','events','leave','performance','reports','requisitions','conveyance','funds'], create: ['tasks','leave','requisitions','conveyance','funds'], edit: ['tasks','leave','performance','requisitions','conveyance','funds'], delete: [], approve: ['leave','requisitions','conveyance','funds'] },
  official: { view: ['dashboard','attendance'], create: ['attendance'], edit: ['attendance'], delete: [], approve: [] },
  manager: { view: ['dashboard','attendance','tasks','events','leave','performance','requisitions','conveyance','funds','reports'], create: ['attendance','tasks','events','leave','performance','requisitions','conveyance','funds'], edit: ['attendance','tasks','events','leave','performance','requisitions','conveyance','funds'], delete: ['tasks'], approve: ['leave','requisitions','conveyance','funds'] },
  employee: { view: ['dashboard','attendance','tasks','leave','requisitions','conveyance','funds'], create: ['attendance','tasks','leave','requisitions','conveyance','funds'], edit: ['tasks','leave','requisitions','conveyance','funds'], delete: [], approve: [] }
};
async function hasAccess(user, module, action) {
  if (user.role === 'admin') return true;
  if (module === 'attendance' && ['view','create'].includes(action)) return user.role !== 'ceo';
  const explicit = (user.access || []).find(item => item.module === module);
  if (explicit) return Boolean(explicit[`can_${action}`]);
  return Boolean((ROLE_ACCESS[user.role] || {})[action]?.includes(module));
}
function hasAllScope(user, module) {
  if (['admin','hr','ceo','chairman'].includes(user.role)) return true;
  return (user.access || []).some(item => item.module === module && item.data_scope === 'all');
}
function allowAccess(module, action, ...legacyRoles) {
  return async (req, res, next) => {
    try { if (await hasAccess(req.user, module, action)) { req.user.currentModule = module; return next(); } }
    catch (e) { return sendDbError(res, e); }
    if (legacyRoles.includes(req.user.role)) return next();
    return res.status(403).json({ error: 'Permission denied' });
  };
}
function isPrivileged(user) { return ['admin','hr','ceo','chairman'].includes(user.role); }
async function teamIds(user) {
  const explicit = user.currentModule && (user.access || []).find(item => item.module === user.currentModule);
  if (explicit?.data_scope === 'all') return null;
  if (isPrivileged(user) && !explicit) return null;
  if (!user.employee_id) return [];
  if (user.role === 'manager') {
    const direct = await db.all('SELECT id FROM employees WHERE reports_to=?', user.employee_id);
    return [Number(user.employee_id), ...direct.map(r => Number(r.id))];
  }
  return [Number(user.employee_id)];
}
async function inScope(user, employeeId) {
  if ((user.currentModule && hasAllScope(user, user.currentModule)) || hasAllScope(user, 'employees')) return true;
  const ids = await teamIds(user);
  return ids === null || ids.includes(Number(employeeId));
}
function placeholders(ids) { return ids.map(() => '?').join(',') || 'NULL'; }
function getEmployeeId(req) { return Number(req.body.employee_id || req.params.employeeId || req.query.employee_id || req.user.employee_id || 0); }

app.get('/api/health', async (req, res) => {
  try {
    const database = await db.get('SELECT 1 ok');
    res.json({ ok: true, service: 'IntellRecurso HRMS API', database: database ? 'connected' : 'unavailable', time: now() });
  } catch (e) { res.status(503).json({ ok:false, service:'IntellRecurso HRMS API', database:'unavailable', error:'Database connection failed', time:now() }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const email = cleanText(req.body.email, '').toLowerCase();
    const password = String(req.body.password || '');
    const user = await db.get("SELECT * FROM users WHERE lower(email)=? AND status='active'", email);
    if (!user || !verifyPassword(password, user.password_hash)) return res.status(401).json({ error: 'Invalid email or password' });
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + SESSION_HOURS * 3600_000).toISOString();
    await db.run('DELETE FROM sessions WHERE expires_at<=?', now());
    await db.run('INSERT INTO sessions(token,user_id,expires_at,created_at) VALUES(?,?,?,?)', token, user.id, expires, now());
    res.setHeader('Set-Cookie', `ir_hrms_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_HOURS*3600}; Secure`);
    await audit(user.id, 'login', 'auth', user.id);
    const me = await sessionUser({ headers: { cookie: `ir_hrms_session=${token}` } });
    res.json({ user: me });
  } catch (e) { sendDbError(res, e); }
});
app.post('/api/auth/logout', requireAuth, async (req, res) => {
  try {
    const token = cookies(req).ir_hrms_session;
    if (token) await db.run('DELETE FROM sessions WHERE token=?', token);
    await audit(req.user.id, 'logout', 'auth', req.user.id);
    res.setHeader('Set-Cookie', 'ir_hrms_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure');
    res.json({ ok: true });
  } catch (e) { sendDbError(res,e); }
});
app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: req.user }));
app.get('/api/notifications', requireAuth, async (req,res)=>{try{const items=await db.all('SELECT id,title,message,entity,entity_id,is_read,created_at FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 50',req.user.id);res.json({items,unread:items.filter(item=>!item.is_read).length});}catch(e){sendDbError(res,e);}});
app.patch('/api/notifications/:id/read', requireAuth, async (req,res)=>{try{await db.run('UPDATE notifications SET is_read=TRUE WHERE id=? AND user_id=?',Number(req.params.id),req.user.id);res.json({ok:true});}catch(e){sendDbError(res,e);}});
app.get('/api/events', requireAuth, allowAccess('events', 'view', 'admin','hr','chairman','ceo','official','manager','employee'), async (req,res)=>{try{const items=await db.all("SELECT id,title,event_date,event_time,location,description FROM events WHERE event_date>=? ORDER BY event_date,event_time NULLS LAST LIMIT 8",localDate());res.json({items});}catch(e){sendDbError(res,e);}});
app.post('/api/events', requireAuth, allowAccess('events', 'create', 'admin','hr','manager'), async (req,res)=>{try{const title=cleanText(req.body.title,''),eventDate=cleanText(req.body.event_date,'');if(!title||!eventDate)return res.status(400).json({error:'Event title and date are required'});const r=await db.get('INSERT INTO events(title,event_date,event_time,location,description,created_by,created_at) VALUES(?,?,?,?,?,?,?) RETURNING id',title,eventDate,cleanText(req.body.event_time),cleanText(req.body.location),cleanText(req.body.description),req.user.id,now());await audit(req.user.id,'create','event',r.id,req.body);res.status(201).json({id:Number(r.id)});}catch(e){sendDbError(res,e);}});
app.post('/api/auth/change-password', requireAuth, async (req,res)=>{
  try {
    const current=String(req.body.current_password||''), next=String(req.body.new_password||'');
    const row=await db.get('SELECT password_hash FROM users WHERE id=?', req.user.id);
    if(!row || !verifyPassword(current,row.password_hash)) return res.status(400).json({error:'Current password is incorrect'});
    if(next.length<10) return res.status(400).json({error:'New password must be at least 10 characters'});
    await db.run('UPDATE users SET password_hash=? WHERE id=?',hashPassword(next),req.user.id);
    const currentToken = cookies(req).ir_hrms_session || '';
    await db.run('DELETE FROM sessions WHERE user_id=? AND token<>?',req.user.id,currentToken);
    await audit(req.user.id,'change_password','user',req.user.id);
    res.json({ok:true});
  } catch (e) { sendDbError(res,e); }
});

app.get('/api/dashboard', requireAuth, allowAccess('dashboard', 'view'), async (req, res) => {
  try {
    const today = localDate();
    const ids = await teamIds(req.user);
    const scoped = ids !== null;
    const ph = scoped ? placeholders(ids) : '';
    const activeWhere = scoped ? ` AND id IN (${ph})` : '';
    const empArgs = scoped ? ids : [];
    const totalEmployees = Number((await db.get(`SELECT COUNT(*)::int c FROM employees WHERE employment_status='active'${activeWhere}`,...empArgs)).c || 0);
    const attendanceArgs = [today,...empArgs];
    const recordScope = scoped ? ` AND employee_id IN (${ph})` : '';
    const present = Number((await db.get(`SELECT COUNT(*)::int c FROM attendance WHERE date=? AND status IN ('present','late')${recordScope}`,...attendanceArgs)).c || 0);
    const attendanceExceptions = Number((await db.get(`SELECT COUNT(*)::int c FROM attendance WHERE date=? AND (status IN ('late','absent') OR correction_status='pending')${recordScope}`,...attendanceArgs)).c || 0);
    const pendingLeave = Number((await db.get(`SELECT COUNT(*)::int c FROM leave_requests WHERE status='pending'${recordScope}`,...empArgs)).c || 0);
    const pendingReq = Number((await db.get(`SELECT COUNT(*)::int c FROM requisitions WHERE status='pending'${recordScope}`,...empArgs)).c || 0);
    const openFunds = Number((await db.get(`SELECT COUNT(*)::int c FROM funds WHERE status<>'settled'${recordScope}`,...empArgs)).c || 0);
    const taskScope = scoped ? ` AND assigned_to IN (${ph})` : '';
    const dueSoon = Number((await db.get(`SELECT COUNT(*)::int c FROM tasks WHERE status NOT IN ('completed','cancelled') AND due_date IS NOT NULL AND due_date::date<=CURRENT_DATE+INTERVAL '2 day'${taskScope}`,...empArgs)).c || 0);
    const urgent = Number((await db.get(`SELECT COUNT(*)::int c FROM requisitions WHERE status='pending' AND priority IN ('high','urgent')${recordScope}`,...empArgs)).c || 0);
    const taskStats = await db.get(`SELECT COUNT(*)::int total,COUNT(*) FILTER (WHERE status='completed')::int completed,COUNT(*) FILTER (WHERE status='in_progress')::int in_progress FROM tasks WHERE 1=1${taskScope}`,...empArgs);
    const attendanceTrend=[];
    for(let offset=6;offset>=0;offset--){const date=new Date(Date.now()-offset*86400000).toISOString().slice(0,10);const row=await db.get(`SELECT COUNT(*)::int total,COUNT(*) FILTER (WHERE status IN ('present','late'))::int present FROM attendance WHERE date=?${recordScope}`,date,...empArgs);attendanceTrend.push({date,total:Number(row?.total||0),present:Number(row?.present||0)});}
    let events=[];
    try { events=await db.all("SELECT id,title,event_date,event_time,location,description FROM events WHERE event_date>=? ORDER BY event_date,event_time NULLS LAST LIMIT 8",today); }
    catch (e) { console.error('Events table is not available yet', e); }
    const openActions = pendingLeave + pendingReq + openFunds + attendanceExceptions;
    res.json({ today,totalEmployees,present,attendanceExceptions,pendingLeave,pendingReq,openFunds,dueSoon,openActions,ceoAttention:urgent+pendingLeave,taskStats:{total:Number(taskStats?.total||0),completed:Number(taskStats?.completed||0),inProgress:Number(taskStats?.in_progress||0)},attendanceTrend,events });
  } catch (e) { sendDbError(res,e); }
});

app.get('/api/departments', requireAuth, allowAccess('organization', 'view'), async (req, res) => {
  try { res.json({ items: await db.all('SELECT * FROM departments ORDER BY name') }); } catch(e){ sendDbError(res,e); }
});
app.post('/api/departments', requireAuth, allowAccess('organization', 'create', 'admin','hr'), async (req, res) => {
  try {
    const name = cleanText(req.body.name, '');
    if (!name) return res.status(400).json({ error: 'Department name is required' });
    const r = await db.get('INSERT INTO departments(name,created_at) VALUES(?,?) RETURNING id', name, now());
    await audit(req.user.id, 'create', 'department', r.id, { name });
    res.status(201).json({ id: Number(r.id) });
  } catch (e) { sendDbError(res, e); }
});

app.get('/api/employees', requireAuth, allowAccess('employees', 'view'), async (req, res) => {
  try {
    const ids = await teamIds(req.user); let where=''; let args=[];
    if(ids!==null){where=`WHERE e.id IN (${placeholders(ids)})`;args=ids;}
    let items=await db.all(`SELECT e.*,d.name department,m.name manager_name FROM employees e LEFT JOIN departments d ON d.id=e.department_id LEFT JOIN employees m ON m.id=e.reports_to ${where} ORDER BY e.name`,...args);
    if(!['admin','hr','ceo'].includes(req.user.role)) items=items.map(x=>Number(x.id)===Number(req.user.employee_id)?x:{...x,base_salary:null});
    res.json({items});
  } catch(e){sendDbError(res,e);}
});
app.get('/api/employees/:id', requireAuth, allowAccess('employees', 'view'), async (req,res)=>{
  try{
    const id=Number(req.params.id); if(!(await inScope(req.user,id)))return res.status(403).json({error:'Permission denied'});
    let item=await db.get('SELECT e.*,d.name department,m.name manager_name FROM employees e LEFT JOIN departments d ON d.id=e.department_id LEFT JOIN employees m ON m.id=e.reports_to WHERE e.id=?',id);
    if(!item)return res.status(404).json({error:'Employee not found'});
    if(!['admin','hr','ceo'].includes(req.user.role)&&Number(item.id)!==Number(req.user.employee_id))item={...item,base_salary:null};
    res.json({item});
  }catch(e){sendDbError(res,e);}
});
app.post('/api/employees', requireAuth, allowAccess('employees', 'create', 'admin','hr'), async (req,res)=>{
  try{
    const name=cleanText(req.body.name,''),designation=cleanText(req.body.designation,'');
    if(!name||!designation)return res.status(400).json({error:'Name and designation are required'});
    const ts=now();
    const r=await db.get(`INSERT INTO employees(employee_code,name,email,phone,designation,department_id,reports_to,employment_status,join_date,base_salary,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,cleanText(req.body.employee_code),name,cleanText(req.body.email),cleanText(req.body.phone),designation,req.body.department_id?Number(req.body.department_id):null,req.body.reports_to?Number(req.body.reports_to):null,cleanText(req.body.employment_status,'active'),cleanText(req.body.join_date),num(req.body.base_salary),ts,ts);
    await audit(req.user.id,'create','employee',r.id,{name,designation});res.status(201).json({id:Number(r.id)});
  }catch(e){sendDbError(res,e);}
});
app.patch('/api/employees/:id', requireAuth, allowAccess('employees', 'edit', 'admin','hr'), async (req,res)=>{
  try{
    const id=Number(req.params.id),old=await db.get('SELECT * FROM employees WHERE id=?',id);if(!old)return res.status(404).json({error:'Employee not found'});
    const d={...old,...req.body};
    await db.run(`UPDATE employees SET employee_code=?,name=?,email=?,phone=?,designation=?,department_id=?,reports_to=?,employment_status=?,join_date=?,base_salary=?,updated_at=? WHERE id=?`,cleanText(d.employee_code),cleanText(d.name,''),cleanText(d.email),cleanText(d.phone),cleanText(d.designation,''),d.department_id?Number(d.department_id):null,d.reports_to?Number(d.reports_to):null,cleanText(d.employment_status,'active'),cleanText(d.join_date),num(d.base_salary),now(),id);
    await audit(req.user.id,'update','employee',id,req.body);res.json({ok:true});
  }catch(e){sendDbError(res,e);}
});
app.delete('/api/employees/:id', requireAuth, allowAccess('employees', 'delete', 'admin'), async (req,res)=>{
  try{
    const id=Number(req.params.id),r=await db.get('DELETE FROM employees WHERE id=? RETURNING id',id);if(!r)return res.status(404).json({error:'Employee not found'});
    await audit(req.user.id,'delete','employee',id);res.json({ok:true});
  }catch(e){sendDbError(res,e);}
});
app.get('/api/organization', requireAuth, allowAccess('organization', 'view'), async (req,res)=>{
  try{const items=await db.all("SELECT e.id,e.name,e.designation,e.reports_to,m.name manager_name,d.name department FROM employees e LEFT JOIN employees m ON m.id=e.reports_to LEFT JOIN departments d ON d.id=e.department_id WHERE e.employment_status='active' ORDER BY e.reports_to NULLS FIRST,e.name");res.json({items});}catch(e){sendDbError(res,e);}
});

app.get('/api/attendance', requireAuth, allowAccess('attendance', 'view'), async (req,res)=>{
  try{
    const clauses=[],args=[],ids=await teamIds(req.user);
    if(ids!==null){clauses.push(`a.employee_id IN (${placeholders(ids)})`);args.push(...ids);}
    if(req.query.date){clauses.push('a.date=?');args.push(req.query.date);}
    if(req.query.month){clauses.push('substring(a.date from 1 for 7)=?');args.push(req.query.month);}
    const items=await db.all(`SELECT a.*,e.name employee_name FROM attendance a JOIN employees e ON e.id=a.employee_id ${clauses.length?'WHERE '+clauses.join(' AND '):''} ORDER BY a.date DESC,e.name`,...args);res.json({items});
  }catch(e){sendDbError(res,e);}
});
app.post('/api/attendance/mark', requireAuth, async (req,res)=>{
  try {
    if (String(req.user.role || '').toLowerCase() === 'ceo') return res.status(403).json({error:'CEO accounts do not mark attendance'});
    const employeeId=Number(req.user.employee_id||0),status=cleanText(req.body.status,'');
    if(!employeeId)return res.status(400).json({error:'Your account is not linked to an employee record'});
    if(!['present','absent'].includes(status))return res.status(400).json({error:'Attendance status must be present or absent'});
    const date=localDate(),time=localTime(),existing=await db.get('SELECT id FROM attendance WHERE employee_id=? AND date=?',employeeId,date);
    if(existing) await db.run('UPDATE attendance SET check_in=?,status=?,note=?,updated_at=? WHERE id=?',time,status,status==='absent'?'Marked absent by employee':'Marked present by employee',now(),existing.id);
    else await db.run('INSERT INTO attendance(employee_id,date,check_in,status,note,correction_status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',employeeId,date,time,status,status==='absent'?'Marked absent by employee':null,'none',now(),now());
    await audit(req.user.id,'mark','attendance',existing?.id||null,{employee_id:employeeId,date,time,status});
    await notifyRoles(['hr'],'Attendance marked',`${req.user.name || req.user.email} marked ${status} on ${date} at ${time}.`,'attendance',existing?.id||null);
    res.json({ok:true,date,time,status});
  } catch(e) { sendDbError(res,e); }
});
app.post('/api/attendance', requireAuth, allowAccess('attendance', 'create', 'admin','hr','manager'), async (req,res)=>{
  try{
    const employeeId=getEmployeeId(req);if(!employeeId||!(await inScope(req.user,employeeId)))return res.status(403).json({error:'Permission denied'});
    if(req.user.role==='manager'&&employeeId===Number(req.user.employee_id))return res.status(403).json({error:'Managers cannot modify their own attendance'});
    const date=cleanText(req.body.date,localDate()),ts=now();const existing=await db.get('SELECT id FROM attendance WHERE employee_id=? AND date=?',employeeId,date);
    const correction=isPrivileged(req.user)||req.user.role==='manager'?cleanText(req.body.correction_status,'none'):(req.body.correction_status&&req.body.correction_status!=='none'?'pending':'none');
    if(existing){await db.run('UPDATE attendance SET check_in=?,check_out=?,status=?,late_minutes=?,overtime_minutes=?,note=?,correction_status=?,updated_at=? WHERE id=?',cleanText(req.body.check_in),cleanText(req.body.check_out),cleanText(req.body.status,'present'),num(req.body.late_minutes),num(req.body.overtime_minutes),cleanText(req.body.note),correction,ts,existing.id);await audit(req.user.id,'update','attendance',existing.id,req.body);return res.json({id:Number(existing.id)});}
    const r=await db.get('INSERT INTO attendance(employee_id,date,check_in,check_out,status,late_minutes,overtime_minutes,note,correction_status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) RETURNING id',employeeId,date,cleanText(req.body.check_in),cleanText(req.body.check_out),cleanText(req.body.status,'present'),num(req.body.late_minutes),num(req.body.overtime_minutes),cleanText(req.body.note),correction,ts,ts);await audit(req.user.id,'create','attendance',r.id,req.body);await notifyRoles(['hr'],'Attendance submitted',`${req.user.name || req.user.email} submitted attendance for ${date}.`,'attendance',r.id);res.status(201).json({id:Number(r.id)});
  }catch(e){sendDbError(res,e);}
});
app.patch('/api/attendance/:id', requireAuth, allowAccess('attendance', 'edit'), async (req,res)=>{
  try{
    const id=Number(req.params.id),old=await db.get('SELECT * FROM attendance WHERE id=?',id);if(!old)return res.status(404).json({error:'Attendance record not found'});if(!(await inScope(req.user,old.employee_id)))return res.status(403).json({error:'Permission denied'});if(req.user.role==='manager'&&Number(old.employee_id)===Number(req.user.employee_id))return res.status(403).json({error:'Managers cannot modify their own attendance'});
    if(req.user.role==='employee'){const note=cleanText(req.body.note,old.note);await db.run("UPDATE attendance SET note=?,correction_status='pending',updated_at=? WHERE id=?",note,now(),id);await audit(req.user.id,'correction_request','attendance',id,{note});return res.json({ok:true,correction_status:'pending'});}
    const d={...old,...req.body};await db.run('UPDATE attendance SET check_in=?,check_out=?,status=?,late_minutes=?,overtime_minutes=?,note=?,correction_status=?,updated_at=? WHERE id=?',cleanText(d.check_in),cleanText(d.check_out),cleanText(d.status,'present'),num(d.late_minutes),num(d.overtime_minutes),cleanText(d.note),cleanText(d.correction_status,'none'),now(),id);await audit(req.user.id,'update','attendance',id,req.body);res.json({ok:true});
  }catch(e){sendDbError(res,e);}
});

app.get('/api/leave', requireAuth, allowAccess('leave', 'view'), async (req,res)=>{
  try{const ids=await teamIds(req.user);let where='',args=[];if(ids!==null){where=`WHERE l.employee_id IN (${placeholders(ids)})`;args=ids;}const items=await db.all(`SELECT l.*,e.name employee_name,u.email approver_email FROM leave_requests l JOIN employees e ON e.id=l.employee_id LEFT JOIN users u ON u.id=l.approver_id ${where} ORDER BY l.created_at DESC`,...args);res.json({items});}catch(e){sendDbError(res,e);}
});
app.post('/api/leave', requireAuth, allowAccess('leave', 'create'), async (req,res)=>{
  try{const employeeId=getEmployeeId(req);if(!employeeId||!(await inScope(req.user,employeeId)))return res.status(403).json({error:'Permission denied'});const start=cleanText(req.body.start_date,''),end=cleanText(req.body.end_date,'');if(!start||!end)return res.status(400).json({error:'Start and end dates are required'});const days=req.body.days?num(req.body.days,1):Math.max(1,Math.round((new Date(end)-new Date(start))/86400000)+1),ts=now();const r=await db.get('INSERT INTO leave_requests(employee_id,leave_type,start_date,end_date,days,reason,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?) RETURNING id',employeeId,cleanText(req.body.leave_type,'Annual'),start,end,days,cleanText(req.body.reason),'pending',ts,ts);await audit(req.user.id,'create','leave',r.id,req.body);await notifyRoles(['hr'],'Leave application received',`${req.user.name || req.user.email} submitted a leave application.`,'leave',r.id);res.status(201).json({id:Number(r.id)});}catch(e){sendDbError(res,e);}
});
app.patch('/api/leave/:id', requireAuth, allowAccess('leave', 'edit'), async (req,res)=>{
  try{const id=Number(req.params.id),item=await db.get('SELECT * FROM leave_requests WHERE id=?',id);if(!item)return res.status(404).json({error:'Leave request not found'});if(!(await inScope(req.user,item.employee_id)))return res.status(403).json({error:'Permission denied'});if(!['admin','hr'].includes(req.user.role)&&Number(item.employee_id)!==Number(req.user.employee_id))return res.status(403).json({error:'Only the requester or HR can edit this leave request'});if(!['admin','hr'].includes(req.user.role)&&item.status!=='pending')return res.status(409).json({error:'Only pending leave can be edited'});const d={...item,...req.body},start=cleanText(d.start_date,item.start_date),end=cleanText(d.end_date,item.end_date),days=req.body.days!==undefined?num(req.body.days,item.days):Math.max(1,Math.round((new Date(end)-new Date(start))/86400000)+1);await db.run('UPDATE leave_requests SET leave_type=?,start_date=?,end_date=?,days=?,reason=?,updated_at=? WHERE id=?',cleanText(d.leave_type,item.leave_type),start,end,days,cleanText(d.reason),now(),id);await audit(req.user.id,'update','leave',id,req.body);res.json({ok:true});}catch(e){sendDbError(res,e);}
});
app.patch('/api/leave/:id/cancel', requireAuth, allowAccess('leave', 'edit'), async (req,res)=>{
  try{const id=Number(req.params.id),item=await db.get('SELECT * FROM leave_requests WHERE id=?',id);if(!item)return res.status(404).json({error:'Leave request not found'});if(!(await inScope(req.user,item.employee_id)))return res.status(403).json({error:'Permission denied'});if(!['admin','hr'].includes(req.user.role)&&Number(item.employee_id)!==Number(req.user.employee_id))return res.status(403).json({error:'Only the requester or HR can cancel this leave request'});if(item.status!=='pending')return res.status(409).json({error:'Only pending leave can be cancelled'});await db.run("UPDATE leave_requests SET status='cancelled',updated_at=? WHERE id=?",now(),id);await audit(req.user.id,'cancel','leave',id);res.json({ok:true});}catch(e){sendDbError(res,e);}
});
app.patch('/api/leave/:id/status', requireAuth, allowAccess('leave', 'approve', 'admin','hr','ceo','manager'), async (req,res)=>{
  try{const id=Number(req.params.id),item=await db.get('SELECT * FROM leave_requests WHERE id=?',id);if(!item)return res.status(404).json({error:'Leave request not found'});if(!(await inScope(req.user,item.employee_id)))return res.status(403).json({error:'Permission denied'});if(!['admin','hr'].includes(req.user.role)&&Number(item.employee_id)===Number(req.user.employee_id))return res.status(403).json({error:'You cannot approve your own leave request'});const status=cleanText(req.body.status,'');if(!['approved','rejected','pending','cancelled'].includes(status))return res.status(400).json({error:'Invalid status'});await db.run('UPDATE leave_requests SET status=?,approver_id=?,decision_note=?,updated_at=? WHERE id=?',status,req.user.id,cleanText(req.body.decision_note),now(),id);await audit(req.user.id,'status','leave',id,{status});res.json({ok:true});}catch(e){sendDbError(res,e);}
});

app.get('/api/tasks', requireAuth, allowAccess('tasks', 'view'), async (req,res)=>{
  try{const ids=await teamIds(req.user);let where='',args=[];if(ids!==null){where=`WHERE t.assigned_to IN (${placeholders(ids)})`;args=ids;}const items=await db.all(`SELECT t.*,e.name employee_name,u.email assigned_by_email FROM tasks t JOIN employees e ON e.id=t.assigned_to LEFT JOIN users u ON u.id=t.assigned_by ${where} ORDER BY CASE t.status WHEN 'pending' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,t.due_date`,...args);res.json({items});}catch(e){sendDbError(res,e);}
});
app.post('/api/tasks', requireAuth, allowAccess('tasks', 'create', 'admin','hr','ceo','manager'), async (req,res)=>{
  try{const employeeId=Number(req.body.assigned_to||0);if(!employeeId||!(await inScope(req.user,employeeId)))return res.status(403).json({error:'Permission denied'});const title=cleanText(req.body.title,'');if(!title)return res.status(400).json({error:'Task title is required'});const ts=now();const r=await db.get('INSERT INTO tasks(title,description,assigned_to,assigned_by,due_date,priority,status,progress,kpi_link,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) RETURNING id',title,cleanText(req.body.description),employeeId,req.user.id,cleanText(req.body.due_date),cleanText(req.body.priority,'medium'),'pending',0,cleanText(req.body.kpi_link),ts,ts);await audit(req.user.id,'create','task',r.id,req.body);res.status(201).json({id:Number(r.id)});}catch(e){sendDbError(res,e);}
});
app.patch('/api/tasks/:id', requireAuth, allowAccess('tasks', 'edit'), async (req,res)=>{
  try{const id=Number(req.params.id),old=await db.get('SELECT * FROM tasks WHERE id=?',id);if(!old)return res.status(404).json({error:'Task not found'});if(!(await inScope(req.user,old.assigned_to)))return res.status(403).json({error:'Permission denied'});const employeeOnly=req.user.role==='employee',d={...old,...req.body};if(employeeOnly){d.title=old.title;d.description=old.description;d.assigned_to=old.assigned_to;d.due_date=old.due_date;d.priority=old.priority;d.kpi_link=old.kpi_link;}await db.run('UPDATE tasks SET title=?,description=?,assigned_to=?,due_date=?,priority=?,status=?,progress=?,kpi_link=?,updated_at=? WHERE id=?',cleanText(d.title,''),cleanText(d.description),Number(d.assigned_to),cleanText(d.due_date),cleanText(d.priority,'medium'),cleanText(d.status,'pending'),Math.min(100,Math.max(0,num(d.progress))),cleanText(d.kpi_link),now(),id);await audit(req.user.id,'update','task',id,req.body);res.json({ok:true});}catch(e){sendDbError(res,e);}
});
app.delete('/api/tasks/:id', requireAuth, allowAccess('tasks', 'delete', 'admin','hr','manager'), async (req,res)=>{
  try{const id=Number(req.params.id),r=await db.get('DELETE FROM tasks WHERE id=? RETURNING id',id);if(!r)return res.status(404).json({error:'Task not found'});await audit(req.user.id,'delete','task',id);res.json({ok:true});}catch(e){sendDbError(res,e);}
});

app.get('/api/performance', requireAuth, allowAccess('performance', 'view'), async (req,res)=>{
  try{const ids=await teamIds(req.user);let where='',args=[];if(ids!==null){where=`WHERE p.employee_id IN (${placeholders(ids)})`;args=ids;}const items=await db.all(`SELECT p.*,e.name employee_name,u.email reviewer_email FROM performance_reviews p JOIN employees e ON e.id=p.employee_id LEFT JOIN users u ON u.id=p.reviewer_id ${where} ORDER BY p.period DESC,e.name`,...args);res.json({items});}catch(e){sendDbError(res,e);}
});
app.post('/api/performance', requireAuth, allowAccess('performance', 'create', 'admin','hr','ceo','manager'), async (req,res)=>{
  try{const employeeId=Number(req.body.employee_id||0);if(!employeeId||!(await inScope(req.user,employeeId)))return res.status(403).json({error:'Permission denied'});if(!cleanText(req.body.kpi_name,''))return res.status(400).json({error:'KPI name is required'});const ts=now();const r=await db.get('INSERT INTO performance_reviews(employee_id,period,kpi_name,target,score,status,reviewer_id,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?) RETURNING id',employeeId,cleanText(req.body.period,new Date().toISOString().slice(0,7)),cleanText(req.body.kpi_name,''),cleanText(req.body.target),req.body.score===''||req.body.score==null?null:num(req.body.score),cleanText(req.body.status,'draft'),req.user.id,cleanText(req.body.notes),ts,ts);await audit(req.user.id,'create','performance',r.id,req.body);res.status(201).json({id:Number(r.id)});}catch(e){sendDbError(res,e);}
});
app.patch('/api/performance/:id', requireAuth, allowAccess('performance', 'edit', 'admin','hr','ceo','manager'), async (req,res)=>{
  try{const id=Number(req.params.id),old=await db.get('SELECT * FROM performance_reviews WHERE id=?',id);if(!old)return res.status(404).json({error:'Review not found'});if(!(await inScope(req.user,old.employee_id)))return res.status(403).json({error:'Permission denied'});const d={...old,...req.body};await db.run('UPDATE performance_reviews SET period=?,kpi_name=?,target=?,score=?,status=?,reviewer_id=?,notes=?,updated_at=? WHERE id=?',cleanText(d.period,''),cleanText(d.kpi_name,''),cleanText(d.target),d.score===''||d.score==null?null:num(d.score),cleanText(d.status,'draft'),req.user.id,cleanText(d.notes),now(),id);await audit(req.user.id,'update','performance',id,req.body);res.json({ok:true});}catch(e){sendDbError(res,e);}
});

function addSimpleModule({name,table,dateColumn,fields,employeeField='employee_id',readRoles=null,writeRoles=null,statusRoute=true}) {
  app.get(`/api/${name}`, requireAuth, allowAccess(name, 'view', ...(readRoles || [])), async (req,res)=>{
    try{let ids=await teamIds(req.user);if(['salary_records','letters'].includes(table)&&!['admin','hr','ceo'].includes(req.user.role)&&!(req.user.access||[]).some(item=>item.module===name&&item.data_scope==='all'))ids=req.user.employee_id?[Number(req.user.employee_id)]:[];let where='',args=[];if(ids!==null&&employeeField){where=`WHERE x.${employeeField} IN (${placeholders(ids)})`;args=ids;}const employeeJoin=employeeField?`JOIN employees e ON e.id=x.${employeeField}`:'',selectEmployee=employeeField?',e.name employee_name':'';const items=await db.all(`SELECT x.*${selectEmployee} FROM ${table} x ${employeeJoin} ${where} ORDER BY ${dateColumn?'x.'+dateColumn:'x.id'} DESC`,...args);res.json({items});}catch(e){sendDbError(res,e);}
  });
  app.post(`/api/${name}`, requireAuth, allowAccess(name, 'create', ...(writeRoles || [])), async (req,res)=>{
    try{if(employeeField){const eid=Number(req.body[employeeField]||req.user.employee_id||0);if(!eid||!(await inScope(req.user,eid)))return res.status(403).json({error:'Permission denied'});if(!writeRoles&&!['admin','hr'].includes(req.user.role)&&eid!==Number(req.user.employee_id))return res.status(403).json({error:'You can only create records for yourself'});req.body[employeeField]=eid;}const cols=fields.map(f=>f[0]),vals=fields.map(([key,type,def])=>{let v=req.body[key];if(v===undefined||v===null||v==='')v=typeof def==='function'?def():def;return type==='number'?num(v,0):cleanText(v,def??null);});if(!cols.includes('created_at')){cols.push('created_at');vals.push(now());}if(['requisitions','conveyance','funds'].includes(table)&&!cols.includes('updated_at')){cols.push('updated_at');vals.push(now());}const q=`INSERT INTO ${table}(${cols.join(',')}) VALUES(${cols.map(()=>'?').join(',')}) RETURNING id`;const r=await db.get(q,...vals);await audit(req.user.id,'create',name,r.id,req.body);if(['requisitions','conveyance','funds'].includes(name))await notifyRoles(['hr'],'New request received',`${req.user.name || req.user.email} submitted a ${name} request for review.` ,name,r.id);res.status(201).json({id:Number(r.id)});}catch(e){sendDbError(res,e);}
  });
  app.patch(`/api/${name}/:id`, requireAuth, allowAccess(name, 'edit', ...(writeRoles || [])), async (req,res)=>{
    try{const id=Number(req.params.id),item=await db.get(`SELECT * FROM ${table} WHERE id=?`,id);if(!item)return res.status(404).json({error:'Record not found'});if(employeeField&&!(await inScope(req.user,item[employeeField])))return res.status(403).json({error:'Permission denied'});if(!writeRoles&&employeeField&&!['admin','hr'].includes(req.user.role)&&Number(item[employeeField])!==Number(req.user.employee_id))return res.status(403).json({error:'You can only edit your own record'});const cols=[],vals=[];for(const [key,type] of fields){if(req.body[key]===undefined)continue;if(key==='status'&&!['admin','hr','ceo','manager'].includes(req.user.role))continue;if(key===employeeField&&employeeField){const eid=Number(req.body[key]);if(!(await inScope(req.user,eid)))return res.status(403).json({error:'Permission denied'});if(!writeRoles&&!['admin','hr'].includes(req.user.role)&&eid!==Number(req.user.employee_id))return res.status(403).json({error:'You cannot reassign this record'});}cols.push(`${key}=?`);vals.push(type==='number'?num(req.body[key]):cleanText(req.body[key]));}if(!cols.length)return res.status(400).json({error:'No editable fields provided'});if(['requisitions','conveyance','funds'].includes(table)){cols.push('updated_at=?');vals.push(now());}vals.push(id);await db.run(`UPDATE ${table} SET ${cols.join(',')} WHERE id=?`,...vals);await audit(req.user.id,'update',name,id,req.body);res.json({ok:true});}catch(e){sendDbError(res,e);}
  });
  if(statusRoute) app.patch(`/api/${name}/:id/status`, requireAuth, allowAccess(name, 'approve', 'admin','hr','ceo','manager'), async (req,res)=>{
    try{const id=Number(req.params.id),status=cleanText(req.body.status,''),item=await db.get(`SELECT * FROM ${table} WHERE id=?`,id);if(!item)return res.status(404).json({error:'Record not found'});if(employeeField&&!(await inScope(req.user,item[employeeField])))return res.status(403).json({error:'Permission denied'});if(employeeField&&!['admin','hr'].includes(req.user.role)&&Number(item[employeeField])===Number(req.user.employee_id))return res.status(403).json({error:'You cannot approve your own record'});const cols=['status=?'],vals=[status];if(['requisitions','conveyance'].includes(table)){cols.push('approved_by=?');vals.push(req.user.id);}if(['requisitions','conveyance','funds'].includes(table)){cols.push('updated_at=?');vals.push(now());}vals.push(id);await db.run(`UPDATE ${table} SET ${cols.join(',')} WHERE id=?`,...vals);await audit(req.user.id,'status',name,id,{status});res.json({ok:true});}catch(e){sendDbError(res,e);}
  });
}

addSimpleModule({name:'requisitions',table:'requisitions',dateColumn:'created_at',writeRoles:null,fields:[['employee_id','number'],['title','text',''],['category','text'],['amount','number',0],['priority','text','normal'],['reason','text'],['status','text','pending']]});
addSimpleModule({name:'conveyance',table:'conveyance',dateColumn:'date',writeRoles:null,fields:[['employee_id','number'],['date','text',()=>new Date().toISOString().slice(0,10)],['route','text'],['purpose','text',''],['amount','number',0],['receipt_ref','text'],['status','text','pending']]});
addSimpleModule({name:'salary',table:'salary_records',dateColumn:'effective_date',writeRoles:['admin','hr'],statusRoute:false,fields:[['employee_id','number'],['effective_date','text',()=>new Date().toISOString().slice(0,10)],['basic_salary','number',0],['allowance','number',0],['deduction','number',0],['net_salary','number',0],['record_type','text','salary'],['note','text']]});
addSimpleModule({name:'funds',table:'funds',dateColumn:'received_date',writeRoles:null,fields:[['employee_id','number'],['received_date','text',()=>new Date().toISOString().slice(0,10)],['amount','number',0],['purpose','text',''],['settled_amount','number',0],['status','text','open'],['invoice_ref','text'],['note','text']]});
addSimpleModule({name:'letters',table:'letters',dateColumn:'issue_date',writeRoles:['admin','hr'],statusRoute:false,fields:[['employee_id','number'],['type','text','Appointment'],['issue_date','text',()=>new Date().toISOString().slice(0,10)],['subject','text',''],['body','text',''],['status','text','issued']]});

app.get('/api/reports', requireAuth, allowAccess('reports', 'view', 'admin','hr','ceo','manager'), async (req,res)=>{
  try{
    const type=cleanText(req.query.type,'month'),period=cleanText(req.query.period,type==='year'?localDate().slice(0,4):localDate().slice(0,7));let from,to,label;
    if(type==='year'){const y=/^\d{4}$/.test(period)?period:localDate().slice(0,4);from=`${y}-01-01`;to=`${y}-12-31`;label=y;}
    else if(type==='week'){const m=String(period).match(/^(\d{4})-W(\d{2})$/i),y=m?Number(m[1]):Number(localDate().slice(0,4)),w=m?Number(m[2]):1,jan4=new Date(Date.UTC(y,0,4)),jan4day=jan4.getUTCDay()||7,monday=new Date(jan4);monday.setUTCDate(jan4.getUTCDate()-jan4day+1+(w-1)*7);const sunday=new Date(monday);sunday.setUTCDate(monday.getUTCDate()+6);from=monday.toISOString().slice(0,10);to=sunday.toISOString().slice(0,10);label=`${y}-W${String(w).padStart(2,'0')}`;}
    else{const m=/^\d{4}-\d{2}$/.test(period)?period:localDate().slice(0,7),[y,mo]=m.split('-').map(Number);from=`${m}-01`;to=new Date(Date.UTC(y,mo,0)).toISOString().slice(0,10);label=m;}
    const scope=await teamIds(req.user),scoped=scope!==null,ph=scoped?placeholders(scope):'',scopeSql=scoped?` AND employee_id IN (${ph})`:'',taskScope=scoped?` AND assigned_to IN (${ph})`:'',empScope=scoped?` AND id IN (${ph})`:'';const sargs=scope||[];
    const active=Number((await db.get(`SELECT COUNT(*)::int c FROM employees WHERE employment_status='active'${empScope}`,...sargs)).c||0);
    const attend=await db.get(`SELECT COUNT(*)::int total,COUNT(*) FILTER (WHERE status IN ('present','late'))::int present,COUNT(*) FILTER (WHERE status='late')::int late,COUNT(*) FILTER (WHERE status='absent')::int absent FROM attendance WHERE date BETWEEN ? AND ?${scopeSql}`,from,to,...sargs);
    const tasks=await db.get(`SELECT COUNT(*)::int total,COUNT(*) FILTER (WHERE status='completed')::int completed,COUNT(*) FILTER (WHERE status NOT IN ('completed','cancelled') AND due_date IS NOT NULL AND due_date::date<CURRENT_DATE)::int overdue FROM tasks WHERE substring(created_at from 1 for 10) BETWEEN ? AND ?${taskScope}`,from,to,...sargs);
    const leave=await db.get(`SELECT COUNT(*)::int total,COUNT(*) FILTER (WHERE status='approved')::int approved,COUNT(*) FILTER (WHERE status='pending')::int pending FROM leave_requests WHERE substring(created_at from 1 for 10) BETWEEN ? AND ?${scopeSql}`,from,to,...sargs);
    const requisition=await db.get(`SELECT COUNT(*)::int total,COALESCE(SUM(amount),0) amount,COUNT(*) FILTER (WHERE status='pending')::int pending FROM requisitions WHERE substring(created_at from 1 for 10) BETWEEN ? AND ?${scopeSql}`,from,to,...sargs);
    const performance=await db.get(`SELECT COUNT(*)::int total,ROUND(AVG(score)::numeric,2) avg_score FROM performance_reviews WHERE substring(created_at from 1 for 10) BETWEEN ? AND ?${scopeSql}`,from,to,...sargs);
    const insights=[];if(Number(attend.absent||0)>0)insights.push({title:'Attendance follow-up',recommendation:`Review ${attend.absent} absence record(s) and confirm documentation or corrective action.`});if(Number(attend.late||0)>0)insights.push({title:'Late attendance trend',recommendation:`Review ${attend.late} late record(s) and identify repeated patterns.`});if(Number(tasks.overdue||0)>0)insights.push({title:'Delivery risk',recommendation:`Follow up on ${tasks.overdue} overdue task(s) and reset ownership/deadlines where needed.`});if(Number(leave.pending||0)>0)insights.push({title:'Leave queue',recommendation:`Resolve ${leave.pending} pending leave request(s) to avoid scheduling uncertainty.`});if(Number(requisition.pending||0)>0)insights.push({title:'Approval queue',recommendation:`Review ${requisition.pending} pending requisition(s), total period value ৳${Number(requisition.amount||0).toLocaleString()}.`});if(performance.avg_score!=null&&Number(performance.avg_score)<70)insights.push({title:'Performance attention',recommendation:`Average KPI score is ${performance.avg_score}; identify employees needing coaching or an improvement plan.`});if(!insights.length)insights.push({title:'No critical exception',recommendation:'No major HR exception is visible for the selected reporting period.'});
    res.json({type,period:label,from,to,activeEmployees:active,attendance:attend,tasks,leave,requisitions:requisition,performance,insights});
  }catch(e){sendDbError(res,e);}
});

app.get('/api/admin/users', requireAuth, allow('admin','hr'), async (req,res)=>{try{const items=await db.all('SELECT u.id,u.employee_id,u.email,u.role,u.status,u.created_at,e.name employee_name FROM users u LEFT JOIN employees e ON e.id=u.employee_id ORDER BY u.id');res.json({items});}catch(e){sendDbError(res,e);}});
app.get('/api/admin/access/:userId', requireAuth, allow('admin'), async (req,res)=>{try{const userId=Number(req.params.userId);res.json({items:await db.all('SELECT module,can_view,can_create,can_edit,can_delete,can_approve,data_scope FROM user_access WHERE user_id=? ORDER BY module',userId)});}catch(e){sendDbError(res,e);}});
app.put('/api/admin/access/:userId', requireAuth, allow('admin'), async (req,res)=>{try{const userId=Number(req.params.userId),permissions=Array.isArray(req.body.permissions)?req.body.permissions:[];const validActions=['can_view','can_create','can_edit','can_delete','can_approve'],validScopes=['self','team','all'];await db.run('DELETE FROM user_access WHERE user_id=?',userId);for(const item of permissions){if(!ACCESS_MODULES.includes(item.module))continue;const values=validActions.map(key=>Boolean(item[key]));const scope=validScopes.includes(item.data_scope)?item.data_scope:'self';await db.run('INSERT INTO user_access(user_id,module,can_view,can_create,can_edit,can_delete,can_approve,data_scope,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',userId,item.module,...values,scope,now());}await audit(req.user.id,'update','user_access',userId,{modules:permissions.length});res.json({ok:true});}catch(e){sendDbError(res,e);}});
app.post('/api/admin/users', requireAuth, allow('admin'), async (req,res)=>{try{const email=cleanText(req.body.email,'').toLowerCase(),password=String(req.body.password||''),role=cleanText(req.body.role,'employee');if(!email||password.length<10)return res.status(400).json({error:'Valid email and password of at least 10 characters are required'});if(!ROLES.includes(role))return res.status(400).json({error:'Invalid role'});const r=await db.get('INSERT INTO users(employee_id,email,password_hash,role,status,created_at) VALUES(?,?,?,?,?,?) RETURNING id',req.body.employee_id?Number(req.body.employee_id):null,email,hashPassword(password),role,'active',now());await audit(req.user.id,'create','user',r.id,{email,role});res.status(201).json({id:Number(r.id)});}catch(e){sendDbError(res,e);}});
app.patch('/api/admin/users/:id', requireAuth, allow('admin'), async (req,res)=>{try{const id=Number(req.params.id),old=await db.get('SELECT * FROM users WHERE id=?',id);if(!old)return res.status(404).json({error:'User not found'});const role=cleanText(req.body.role,old.role),status=cleanText(req.body.status,old.status),email=cleanText(req.body.email,old.email).toLowerCase();if(!ROLES.includes(role))return res.status(400).json({error:'Invalid role'});const cols=['email=?','role=?','status=?'],vals=[email,role,status];if(req.body.password){if(String(req.body.password).length<10)return res.status(400).json({error:'Password must be at least 10 characters'});cols.push('password_hash=?');vals.push(hashPassword(String(req.body.password)));}vals.push(id);await db.run(`UPDATE users SET ${cols.join(',')} WHERE id=?`,...vals);await audit(req.user.id,'update','user',id,{email,role,status});res.json({ok:true});}catch(e){sendDbError(res,e);}});
app.get('/api/admin/settings', requireAuth, allow('admin','hr'), async (req,res)=>{try{res.json({items:await db.all('SELECT * FROM settings ORDER BY key')});}catch(e){sendDbError(res,e);}});
app.put('/api/admin/settings/:key', requireAuth, allow('admin','hr'), async (req,res)=>{try{const key=cleanText(req.params.key,''),value=cleanText(req.body.value,'');await db.run('INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=EXCLUDED.updated_at',key,value,now());await audit(req.user.id,'update','setting',key,{value});res.json({ok:true});}catch(e){sendDbError(res,e);}});
app.get('/api/admin/audit', requireAuth, allow('admin','hr'), async (req,res)=>{try{const items=await db.all('SELECT a.*,u.email user_email FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 200');res.json({items});}catch(e){sendDbError(res,e);}});

app.use('/api', (req,res)=>res.status(404).json({error:'API endpoint not found',path:req.path,method:req.method}));
export default app;
