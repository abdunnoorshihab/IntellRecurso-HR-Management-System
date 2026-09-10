(() => {
  const page = document.body.dataset.page;
  if (!page) return;

  document.addEventListener('hrms:ready', () => boot().catch(err => {
    console.error(err);
    HRMS.toast(err.message, 'error');
  }));

  const config = {
    employees: {
      title: 'Employees',
      subtitle: 'Employee master data, status and reporting lines.',
      endpoint: '/api/employees',
      columns: [['employee_code','ID'],['name','Name'],['designation','Designation'],['department','Department'],['manager_name','Reports To'],['employment_status','Status']],
      fields: [['employee_code','Employee ID'],['name','Name','text',1],['email','Email','email'],['phone','Phone'],['designation','Designation','text',1],['department_id','Department','select'],['reports_to','Reports To','select'],['employment_status','Status','select'],['join_date','Join Date','date'],['base_salary','Base Salary','number']]
    },
    attendance: {
      title: 'Attendance', subtitle: 'Daily attendance, late/absence exceptions and corrections.', endpoint: '/api/attendance',
      columns: [['date','Date'],['employee_name','Employee'],['check_in','Check In'],['check_out','Check Out'],['status','Status'],['late_minutes','Late (min)'],['overtime_minutes','OT (min)'],['correction_status','Correction']],
      fields: [['employee_id','Employee','select'],['date','Date','date',1],['check_in','Check In','time'],['check_out','Check Out','time'],['status','Status','select'],['late_minutes','Late Minutes','number'],['overtime_minutes','Overtime Minutes','number'],['note','Note','textarea'],['correction_status','Correction','select']]
    },
    tasks: {
      title: 'Daily Tasks', subtitle: 'Assign, monitor and review employee daily tasks and delivery status.', endpoint: '/api/tasks',
      columns: [['title','Task'],['employee_name','Assigned To'],['due_date','Due'],['priority','Priority'],['status','Status'],['progress','Progress']],
      fields: [['title','Task Title','text',1],['description','Description','textarea'],['assigned_to','Assigned To','select'],['due_date','Due Date','date'],['priority','Priority','select'],['status','Status','select'],['progress','Progress %','number'],['kpi_link','KPI Link']]
    },
    leave: {
      title: 'Leave & Approvals', subtitle: 'Leave requests and approval workflow.', endpoint: '/api/leave',
      columns: [['employee_name','Employee'],['leave_type','Type'],['start_date','From'],['end_date','To'],['days','Days'],['status','Status'],['reason','Reason']],
      fields: [['employee_id','Employee','select'],['leave_type','Leave Type','select'],['start_date','Start Date','date',1],['end_date','End Date','date',1],['days','Days','number'],['reason','Reason','textarea']]
    },
    performance: {
      title: 'KPI & Performance', subtitle: 'KPI tracking, scorecards, reviews and performance history.', endpoint: '/api/performance',
      columns: [['employee_name','Employee'],['period','Period'],['kpi_name','KPI'],['target','Target'],['score','Score'],['status','Status']],
      fields: [['employee_id','Employee','select'],['period','Period','month',1],['kpi_name','KPI Name','text',1],['target','Target'],['score','Score','number'],['status','Status','select'],['notes','Notes','textarea']]
    },
    requisitions: {
      title: 'Requisition', subtitle: 'Requests, budgets, priority, review and approval.', endpoint: '/api/requisitions',
      columns: [['employee_name','Employee'],['title','Request'],['category','Category'],['amount','Amount'],['priority','Priority'],['status','Status']],
      fields: [['employee_id','Employee','select'],['title','Title','text',1],['category','Category'],['amount','Amount','number'],['priority','Priority','select'],['reason','Reason','textarea']]
    },
    conveyance: {
      title: 'Conveyance', subtitle: 'Employee conveyance requests, route, purpose and reimbursement.', endpoint: '/api/conveyance',
      columns: [['date','Date'],['employee_name','Employee'],['route','Route'],['purpose','Purpose'],['amount','Amount'],['status','Status']],
      fields: [['employee_id','Employee','select'],['date','Date','date',1],['route','Route'],['purpose','Purpose','text',1],['amount','Amount','number'],['receipt_ref','Receipt Ref']]
    },
    salary: {
      title: 'Salary', subtitle: 'Salary records, advances, increments and history.', endpoint: '/api/salary',
      columns: [['effective_date','Effective'],['employee_name','Employee'],['record_type','Type'],['basic_salary','Basic'],['allowance','Allowance'],['deduction','Deduction'],['net_salary','Net']],
      fields: [['employee_id','Employee','select'],['effective_date','Effective Date','date',1],['record_type','Record Type','select'],['basic_salary','Basic Salary','number'],['allowance','Allowance','number'],['deduction','Deduction','number'],['net_salary','Net Salary','number'],['note','Note','textarea']]
    },
    funds: {
      title: 'Employee Funds', subtitle: 'Company funds, invoices, settlement and outstanding balance.', endpoint: '/api/funds',
      columns: [['received_date','Date'],['employee_name','Employee'],['purpose','Purpose'],['amount','Received'],['settled_amount','Settled'],['status','Status'],['invoice_ref','Invoice']],
      fields: [['employee_id','Employee','select'],['received_date','Received Date','date',1],['amount','Amount','number'],['purpose','Purpose','text',1],['settled_amount','Settled Amount','number'],['invoice_ref','Invoice Ref'],['note','Note','textarea']]
    },
    letters: {
      title: 'Letters', subtitle: 'Appointment, experience and HR letters.', endpoint: '/api/letters',
      columns: [['issue_date','Issue Date'],['employee_name','Employee'],['type','Type'],['subject','Subject'],['status','Status']],
      fields: [['employee_id','Employee','select'],['type','Letter Type','select'],['issue_date','Issue Date','date',1],['subject','Subject','text',1],['body','Letter Body','textarea',1]]
    }
  };

  async function boot() {
    if (page === 'dashboard') return dashboard();
    if (page === 'organization') return organization();
    if (page === 'reports') return reports();
    if (page === 'admin') return admin();
    const c = config[page];
    if (c) return renderModule(c);
  }

  async function getEmployees() { return (await HRMS.api('/api/employees')).items; }
  async function getDepartments() { return (await HRMS.api('/api/departments')).items; }

  function optionsFor(name, emps, depts) {
    const blank = [{ value: '', label: '— Select —' }];
    if (['employee_id','assigned_to','reports_to'].includes(name)) return blank.concat(emps.map(e => ({ value: e.id, label: e.name })));
    if (name === 'department_id') return blank.concat(depts.map(d => ({ value: d.id, label: d.name })));
    const maps = {
      employment_status: ['active','inactive','on_leave','terminated'],
      status: ['pending','in_progress','completed','approved','rejected','draft','finalized'],
      priority: ['low','medium','high','urgent','normal'],
      correction_status: ['none','pending','approved','rejected'],
      leave_type: ['Annual','Casual','Sick','Unpaid','Maternity/Paternity'],
      record_type: ['salary','advance','increment'],
      type: ['Appointment','Experience','Warning','Confirmation','Other']
    };
    return (maps[name] || []).map(v => ({ value: v, label: v.replaceAll('_',' ') }));
  }

  function fieldDefs(c, emps, depts) {
    return c.fields.map(([name,label,type='text',required]) => ({
      name, label, type, required,
      options: type === 'select' ? optionsFor(name, emps, depts) : undefined,
      min: name === 'progress' ? 0 : undefined,
      max: name === 'progress' ? 100 : undefined
    }));
  }

  function canCreateForPage() {
    const role = HRMS.user.role;
    const roles = {
      employees: ['admin','hr'],
      attendance: ['admin','hr','manager'],
      tasks: ['admin','hr','ceo','manager'],
      leave: ['admin','hr','ceo','manager','employee'],
      performance: ['admin','hr','ceo','manager'],
      requisitions: ['admin','hr','ceo','manager','employee'],
      conveyance: ['admin','hr','ceo','manager','employee'],
      salary: ['admin','hr'],
      funds: ['admin','hr','ceo','manager','employee'],
      letters: ['admin','hr']
    };
    return (roles[page] || []).includes(role);
  }

  async function renderModule(c) {
    const [data, emps, depts] = await Promise.all([HRMS.api(c.endpoint), getEmployees(), getDepartments()]);
    const items = data.items || [];
    const pending = items.filter(i => ['pending','open','draft'].includes(String(i.status || i.correction_status))).length;
    const done = items.filter(i => ['approved','completed','settled','issued','finalized'].includes(String(i.status))).length;

    document.getElementById('pageTitle').textContent = c.title;
    document.getElementById('pageSubtitle').textContent = c.subtitle;
    const add = document.getElementById('addBtn');
    if (add) {
      add.hidden = !canCreateForPage();
      add.onclick = () => openCreate(c, emps, depts);
    }

    document.getElementById('summaryCards').innerHTML = cards([
      ['Total Records', items.length, 'Current view'],
      ['Pending', pending, 'Needs action'],
      ['Approved / Done', done, 'Completed'],
      ['Role', HRMS.user.role.toUpperCase(), 'Current access']
    ]);

    const tbody = items.map(i => `<tr>${c.columns.map(([k]) => `<td>${formatCell(k,i[k])}</td>`).join('')}<td>${actions(i)}</td></tr>`).join('');
    document.getElementById('dataPanel').innerHTML = `
      <div class="panel-head"><h2>${c.title} Records</h2><input id="tableSearch" class="search" placeholder="Search records..."></div>
      <div class="table-wrap"><table><thead><tr>${c.columns.map(([,l]) => `<th>${l}</th>`).join('')}<th>Actions</th></tr></thead>
      <tbody id="dataRows">${tbody || `<tr><td colspan="${c.columns.length+1}" class="empty">No records yet.</td></tr>`}</tbody></table></div>`;
    document.getElementById('tableSearch').oninput = e => filterRows(e.target.value);
    bindActions(c, items, emps, depts);
  }

  function cards(arr) {
    return arr.map(([a,b,c]) => `<article><span>${HRMS.esc(a)}</span><strong>${HRMS.esc(b)}</strong><small>${HRMS.esc(c)}</small></article>`).join('');
  }

  function formatCell(k, v) {
    if (v == null || v === '') return '<span class="muted">—</span>';
    if (k === 'amount' || k.includes('salary') || ['allowance','deduction','net_salary','settled_amount'].includes(k)) return `৳${Number(v).toLocaleString()}`;
    if (k === 'progress') return `<span class="progress"><i style="width:${Math.max(0,Math.min(100,Number(v)))}%"></i></span> ${Number(v)}%`;
    if (['status','employment_status','correction_status','priority'].includes(k)) return `<span class="badge ${String(v).replaceAll('_','-')}">${HRMS.esc(String(v).replaceAll('_',' '))}</span>`;
    return HRMS.esc(v);
  }

  function isSelf(record) {
    const employeeId = record.employee_id ?? record.assigned_to ?? record.id;
    return Number(employeeId) === Number(HRMS.user.employee_id);
  }

  function actions(i) {
    const role = HRMS.user.role;
    const elevated = ['admin','hr'].includes(role);
    const approver = ['admin','hr','ceo','manager'].includes(role);
    let html = '';

    if (page === 'employees' && elevated) html += editBtn(i.id);
    if (page === 'attendance') {
      if (['admin','hr','manager'].includes(role)) html += editBtn(i.id);
      else if (role === 'employee' && isSelf(i)) html += `<button class="mini secondary" data-correction="${i.id}">${i.correction_status === 'pending' ? 'Correction Pending' : 'Request Correction'}</button>`;
    }
    if (page === 'tasks' && (['admin','hr','ceo','manager'].includes(role) || (role === 'employee' && isSelf(i)))) html += editBtn(i.id);
    if (page === 'performance' && ['admin','hr','ceo','manager'].includes(role)) html += editBtn(i.id);

    if (page === 'leave' && i.status === 'pending') {
      if (elevated || isSelf(i)) html += editBtn(i.id);
      if (isSelf(i)) html += ` <button class="mini secondary" data-cancel-leave="${i.id}">Cancel</button>`;
      if (approver && !isSelf(i)) html += approvalButtons(i.id);
    }

    if (['requisitions','conveyance'].includes(page)) {
      if ((elevated || isSelf(i)) && i.status === 'pending') html += editBtn(i.id);
      if (approver && !isSelf(i) && i.status === 'pending') html += approvalButtons(i.id);
    }

    if (page === 'funds') {
      if ((elevated || isSelf(i)) && i.status !== 'settled') html += editBtn(i.id);
      if (approver && !isSelf(i) && i.status !== 'settled') html += ` <button class="mini" data-status="settled" data-id="${i.id}">Settle</button>`;
    }

    if (['salary','letters'].includes(page) && elevated) html += editBtn(i.id);
    return html || '<span class="muted">—</span>';
  }

  function editBtn(id) { return `<button class="mini secondary" data-edit="${id}">Edit</button>`; }
  function approvalButtons(id) { return ` <button class="mini" data-status="approved" data-id="${id}">Approve</button> <button class="mini danger" data-status="rejected" data-id="${id}">Reject</button>`; }

  function bindActions(c, items, emps, depts) {
    document.querySelectorAll('[data-status]').forEach(b => b.onclick = async () => {
      try {
        await HRMS.api(`${c.endpoint}/${b.dataset.id}/status`, { method:'PATCH', body:JSON.stringify({status:b.dataset.status}) });
        HRMS.toast(`Marked ${b.dataset.status}`);
        await renderModule(c);
      } catch (e) { HRMS.toast(e.message,'error'); }
    });

    document.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => {
      const item = items.find(x => String(x.id) === b.dataset.edit);
      openEdit(c, item, emps, depts);
    });

    document.querySelectorAll('[data-cancel-leave]').forEach(b => b.onclick = async () => {
      try {
        await HRMS.api(`/api/leave/${b.dataset.cancelLeave}/cancel`, { method:'PATCH', body:'{}' });
        HRMS.toast('Leave request cancelled');
        await renderModule(c);
      } catch (e) { HRMS.toast(e.message,'error'); }
    });

    document.querySelectorAll('[data-correction]').forEach(b => b.onclick = () => {
      if (b.textContent.includes('Pending')) return;
      const item = items.find(x => String(x.id) === b.dataset.correction);
      HRMS.modal('Attendance Correction Request', [{name:'note',label:'Explain the correction needed',type:'textarea',required:true}], {note:item?.note || ''}, async obj => {
        await HRMS.api(`/api/attendance/${b.dataset.correction}`, {method:'PATCH', body:JSON.stringify({note:obj.note,correction_status:'pending'})});
        await renderModule(c);
      });
    });
  }

  function createFields(c, emps, depts) {
    let fields = fieldDefs(c, emps, depts);
    if (page === 'tasks') fields = fields.filter(f => !['status','progress'].includes(f.name));
    if (page === 'attendance' && HRMS.user.role === 'employee') fields = fields.filter(f => !['status','late_minutes','overtime_minutes','correction_status'].includes(f.name));
    return fields;
  }

  function editFields(c, emps, depts) {
    let fields = fieldDefs(c, emps, depts);
    if (page === 'tasks' && HRMS.user.role === 'employee') fields = fields.filter(f => ['status','progress'].includes(f.name));
    if (['requisitions','conveyance','funds'].includes(page) && !['admin','hr'].includes(HRMS.user.role)) fields = fields.filter(f => f.name !== 'employee_id');
    if (page === 'leave') fields = fields.filter(f => f.name !== 'employee_id');
    return fields;
  }

  function openCreate(c, emps, depts) {
    const fields = createFields(c, emps, depts);
    const defaults = {};
    if (HRMS.user.role === 'employee' && HRMS.user.employee_id) {
      if (fields.some(f => f.name === 'employee_id')) defaults.employee_id = HRMS.user.employee_id;
    }
    HRMS.modal(`Add ${c.title}`, fields, defaults, async obj => {
      if (page === 'salary') obj.net_salary = Number(obj.net_salary || 0) || Number(obj.basic_salary || 0) + Number(obj.allowance || 0) - Number(obj.deduction || 0);
      await HRMS.api(c.endpoint, { method:'POST', body:JSON.stringify(obj) });
      await renderModule(c);
    });
  }

  function openEdit(c, item, emps, depts) {
    HRMS.modal(`Edit ${c.title}`, editFields(c, emps, depts), item, async obj => {
      await HRMS.api(`${c.endpoint}/${item.id}`, { method:'PATCH', body:JSON.stringify(obj) });
      await renderModule(c);
    });
  }

  function filterRows(q) {
    q = q.toLowerCase();
    document.querySelectorAll('#dataRows tr').forEach(tr => tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none');
  }

  async function dashboard() {
    const d = await HRMS.api('/api/dashboard');
    document.getElementById('summaryCards').innerHTML = cards([
      ['Today', `${d.present} / ${d.totalEmployees}`, 'Employees present'],
      ['Open HR Actions', d.openActions, 'Pending approvals & follow-ups'],
      ['Tasks Due Soon', d.dueSoon, 'Due within 48 hours'],
      ['CEO Attention', d.ceoAttention, 'Items needing review']
    ]);
    document.getElementById('dashboardControl').innerHTML = `<div>Attendance exceptions <b>${d.attendanceExceptions}</b></div><div>Leave requests pending <b>${d.pendingLeave}</b></div><div>Requisitions awaiting review <b>${d.pendingReq}</b></div><div>Fund settlements open <b>${d.openFunds}</b></div>`;
  }

  async function organization() {
    const data = await HRMS.api('/api/organization');
    const items = data.items || [];
    const add=document.getElementById('addBtn');
    if(add){
      add.hidden=!['admin','hr'].includes(HRMS.user.role);
      add.onclick=()=>HRMS.modal('Add Department',[{name:'name',label:'Department Name',type:'text',required:true}],{},async obj=>{await HRMS.api('/api/departments',{method:'POST',body:JSON.stringify(obj)});await organization();});
    }
    document.getElementById('summaryCards').innerHTML = cards([
      ['Active Employees', items.length, 'Current workforce'],
      ['Managers', new Set(items.map(x => x.reports_to).filter(Boolean)).size, 'Reporting leads'],
      ['Departments', new Set(items.map(x => x.department).filter(Boolean)).size, 'Active departments'],
      ['Role', HRMS.user.role.toUpperCase(), 'Current access']
    ]);
    document.getElementById('dataPanel').innerHTML = `<h2>Reporting Structure</h2><div class="org-list">${items.map(i => `<div><b>${HRMS.esc(i.name)}</b><span>${HRMS.esc(i.designation)} · ${HRMS.esc(i.department || 'No department')}</span><small>Reports to: ${HRMS.esc(i.manager_name || 'Top level')}</small></div>`).join('')}</div>`;
  }

  function isoWeekString(date = new Date()) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(week).padStart(2,'0')}`;
  }

  async function reports() {
    let type = 'month';
    const defaults = { week: isoWeekString(), month: new Date().toISOString().slice(0,7), year: new Date().toISOString().slice(0,4) };
    let period = defaults.month;

    const load = async () => {
      const r = await HRMS.api(`/api/reports?type=${encodeURIComponent(type)}&period=${encodeURIComponent(period)}`);
      document.getElementById('summaryCards').innerHTML = cards([
        ['Active Employees', r.activeEmployees, 'Workforce'],
        ['Attendance', `${r.attendance.present || 0}/${r.attendance.total || 0}`, 'Present records'],
        ['Task Completion', `${r.tasks.completed || 0}/${r.tasks.total || 0}`, 'Completed'],
        ['Avg KPI', r.performance.avg_score ?? '—', 'Performance score']
      ]);
      const inputType = type === 'week' ? 'week' : type === 'year' ? 'number' : 'month';
      const minmax = type === 'year' ? 'min="2020" max="2100"' : '';
      document.getElementById('dataPanel').innerHTML = `
        <div class="panel-head"><div><h2>Executive Report — ${HRMS.esc(r.period)}</h2><small>${HRMS.esc(r.from)} to ${HRMS.esc(r.to)}</small></div>
        <div class="report-controls"><select id="reportType"><option value="week" ${type==='week'?'selected':''}>Weekly</option><option value="month" ${type==='month'?'selected':''}>Monthly</option><option value="year" ${type==='year'?'selected':''}>Yearly</option></select><input id="reportPeriod" type="${inputType}" ${minmax} value="${HRMS.esc(period)}"></div></div>
        <div class="report-grid"><div><span>Late Records</span><b>${r.attendance.late || 0}</b></div><div><span>Absent Records</span><b>${r.attendance.absent || 0}</b></div><div><span>Overdue Tasks</span><b>${r.tasks.overdue || 0}</b></div><div><span>Pending Leave</span><b>${r.leave.pending || 0}</b></div><div><span>Requisition Value</span><b>৳${Number(r.requisitions.amount || 0).toLocaleString()}</b></div><div><span>Pending Requisitions</span><b>${r.requisitions.pending || 0}</b></div></div>
        <div class="insights"><h2>HR Insights & Recommendations</h2>${(r.insights || []).map(x=>`<div><b>${HRMS.esc(x.title)}</b><span>${HRMS.esc(x.recommendation)}</span></div>`).join('')}</div>`;
      document.getElementById('reportType').onchange = e => { type = e.target.value; period = defaults[type]; load(); };
      document.getElementById('reportPeriod').onchange = e => { period = e.target.value; load(); };
    };
    await load();
  }

  async function admin() {
    if (!['admin','hr'].includes(HRMS.user.role)) {
      document.getElementById('dataPanel').innerHTML = '<div class="empty">Administration access is restricted.</div>';
      return;
    }
    const [users, settings, audit] = await Promise.all([HRMS.api('/api/admin/users'), HRMS.api('/api/admin/settings'), HRMS.api('/api/admin/audit')]);
    document.getElementById('summaryCards').innerHTML = cards([
      ['Users', users.items.length, 'System accounts'], ['Settings', settings.items.length, 'Configuration values'], ['Audit Events', audit.items.length, 'Recent actions'], ['Your Role', HRMS.user.role.toUpperCase(), 'Current access']
    ]);
    document.getElementById('dataPanel').innerHTML = `
      <div class="admin-section"><div class="panel-head"><h2>User Accounts</h2>${HRMS.user.role==='admin'?'<button id="newUser">+ Add User</button>':''}</div>
      <div class="table-wrap"><table><thead><tr><th>Employee</th><th>Email</th><th>Role</th><th>Status</th><th>Action</th></tr></thead><tbody>${users.items.map(u => `<tr><td>${HRMS.esc(u.employee_name || '—')}</td><td>${HRMS.esc(u.email)}</td><td>${formatCell('status',u.role)}</td><td>${formatCell('status',u.status)}</td><td>${HRMS.user.role==='admin'?`<button class="mini secondary" data-edit-user="${u.id}">Edit</button>`:'—'}</td></tr>`).join('')}</tbody></table></div></div>
      <div class="admin-section"><h2>System Settings</h2><div class="settings-grid">${settings.items.map(s => `<label>${HRMS.esc(s.key.replaceAll('_',' '))}<div><input data-setting="${HRMS.esc(s.key)}" value="${HRMS.esc(s.value)}"><button class="mini" data-save-setting="${HRMS.esc(s.key)}">Save</button></div></label>`).join('')}</div></div>
      <div class="admin-section"><h2>Recent Audit Log</h2><div class="audit-list">${audit.items.slice(0,30).map(a => `<div><b>${HRMS.esc(a.action)} ${HRMS.esc(a.entity)}</b><span>${HRMS.esc(a.user_email || 'system')}</span><small>${HRMS.esc(a.created_at)}</small></div>`).join('')}</div></div>`;

    document.querySelectorAll('[data-save-setting]').forEach(b => b.onclick = async () => {
      const key = b.dataset.saveSetting;
      const value = document.querySelector(`[data-setting="${key}"]`).value;
      await HRMS.api(`/api/admin/settings/${encodeURIComponent(key)}`, {method:'PUT', body:JSON.stringify({value})});
      HRMS.toast('Setting saved');
    });

    if (HRMS.user.role === 'admin') {
      const emps = await getEmployees();
      const roleOptions = ['admin','hr','ceo','manager','employee'].map(v => ({value:v,label:v}));
      const statusOptions = ['active','disabled'].map(v => ({value:v,label:v}));
      document.getElementById('newUser')?.addEventListener('click', () => HRMS.modal('Create User', [
        {name:'employee_id',label:'Employee',type:'select',options:[{value:'',label:'— No employee link —'},...emps.map(e=>({value:e.id,label:e.name}))]},
        {name:'email',label:'Email',type:'email',required:true},
        {name:'password',label:'Temporary Password',type:'password',required:true},
        {name:'role',label:'Role',type:'select',options:roleOptions}
      ], {}, async obj => { await HRMS.api('/api/admin/users',{method:'POST',body:JSON.stringify(obj)}); await admin(); }));

      document.querySelectorAll('[data-edit-user]').forEach(b => b.onclick = () => {
        const u = users.items.find(x => String(x.id) === b.dataset.editUser);
        HRMS.modal('Edit User', [
          {name:'email',label:'Email',type:'email',required:true},
          {name:'role',label:'Role',type:'select',options:roleOptions},
          {name:'status',label:'Status',type:'select',options:statusOptions},
          {name:'password',label:'Reset Password (optional)',type:'password'}
        ], u, async obj => { if (!obj.password) delete obj.password; await HRMS.api(`/api/admin/users/${u.id}`,{method:'PATCH',body:JSON.stringify(obj)}); await admin(); });
      });
    }
  }
})();
