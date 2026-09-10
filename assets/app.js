(() => {
  const HRMS = window.HRMS = {
    user: null,
    can(module, action='view') {
      if (!this.user) return false;
      if (this.user.role === 'admin') return true;
      const explicit = (this.user.access || []).find(item => item.module === module);
      if (explicit) return Boolean(explicit[`can_${action}`]);
      const defaults = {
        chairman: {view:['dashboard','reports'],approve:['leave','requisitions','conveyance','funds']},
        ceo: {view:['dashboard','tasks','leave','performance','reports','requisitions','conveyance','funds'],create:['tasks','leave','requisitions','conveyance','funds'],edit:['tasks','leave','performance','requisitions','conveyance','funds'],approve:['leave','requisitions','conveyance','funds']},
        official: {view:['dashboard']},
        manager: {view:['dashboard','attendance','tasks','leave','performance','requisitions','conveyance','funds','reports'],create:['tasks','leave','performance','requisitions','conveyance','funds'],edit:['attendance','tasks','leave','performance','requisitions','conveyance','funds'],approve:['leave','requisitions','conveyance','funds']},
        employee: {view:['dashboard','attendance','tasks','leave','requisitions','conveyance','funds'],create:['attendance','tasks','leave','requisitions','conveyance','funds'],edit:['tasks','leave','requisitions','conveyance','funds']},
        hr: {view:['dashboard','employees','organization','attendance','tasks','leave','performance','reports','requisitions','conveyance','salary','funds','letters'],create:['employees','organization','attendance','tasks','leave','performance','requisitions','conveyance','salary','funds','letters'],edit:['employees','organization','attendance','tasks','leave','performance','requisitions','conveyance','salary','funds','letters'],approve:['leave','requisitions','conveyance','funds']}
      };
      return (defaults[this.user.role]?.[action] || []).includes(module);
    },
    async api(url, options = {}) {
      const init = { credentials: 'same-origin', ...options };
      init.headers = { ...(options.body && typeof options.body === 'string' ? {'Content-Type':'application/json'} : {}), ...(options.headers || {}) };
      const res = await fetch(url, init);
      const data = await res.json().catch(() => ({}));
      if (res.status === 401 && !location.pathname.endsWith('login.html')) {
        location.href = 'login.html';
        throw new Error('Authentication required');
      }
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      return data;
    },
    toast(message, type='ok') {
      let el = document.querySelector('.toast');
      if (!el) { el = document.createElement('div'); el.className='toast'; document.body.appendChild(el); }
      el.textContent = message; el.dataset.type = type; el.classList.add('show');
      clearTimeout(HRMS.toastTimer); HRMS.toastTimer=setTimeout(()=>el.classList.remove('show'),2600);
    },
    modal(title, fields, values={}, onSubmit) {
      document.querySelector('.modal-backdrop')?.remove();
      const wrap=document.createElement('div'); wrap.className='modal-backdrop';
      const fieldHtml=fields.map(f=>{
        const value=values[f.name] ?? f.default ?? '';
        if(f.type==='select') return `<label>${f.label}<select name="${f.name}" ${f.required?'required':''}>${(f.options||[]).map(o=>`<option value="${esc(o.value)}" ${String(o.value)===String(value)?'selected':''}>${esc(o.label)}</option>`).join('')}</select></label>`;
        if(f.type==='textarea') return `<label class="wide">${f.label}<textarea name="${f.name}" ${f.required?'required':''}>${esc(value)}</textarea></label>`;
        return `<label>${f.label}<input name="${f.name}" type="${f.type||'text'}" value="${esc(value)}" ${f.required?'required':''} ${f.min!=null?`min="${f.min}"`:''} ${f.max!=null?`max="${f.max}"`:''}></label>`;
      }).join('');
      wrap.innerHTML=`<div class="modal"><div class="modal-head"><h2>${esc(title)}</h2><button type="button" class="icon-btn" data-close>×</button></div><form><div class="form-grid">${fieldHtml}</div><div class="modal-actions"><button type="button" class="secondary" data-close>Cancel</button><button type="submit">Save</button></div></form></div>`;
      document.body.appendChild(wrap);
      wrap.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>wrap.remove());
      wrap.addEventListener('click',e=>{if(e.target===wrap)wrap.remove();});
      wrap.querySelector('form').onsubmit=async e=>{
        e.preventDefault(); const btn=e.submitter; btn.disabled=true;
        try { const obj=Object.fromEntries(new FormData(e.currentTarget).entries()); await onSubmit(obj); wrap.remove(); HRMS.toast('Saved successfully'); }
        catch(err){ HRMS.toast(err.message,'error'); btn.disabled=false; }
      };
    },
    async init() {
      if (location.pathname.endsWith('login.html')) return initLogin();
      try { HRMS.user = (await HRMS.api('/api/auth/me')).user; } catch { return; }
      document.querySelectorAll('.sidebar a').forEach(a=>{
        if(location.pathname.endsWith(a.getAttribute('href')) || (location.pathname==='/' && a.getAttribute('href')==='index.html')) a.classList.add('active'); else a.classList.remove('active');
        const href=a.getAttribute('href');
        const module=href.replace('.html','').replace('index','dashboard').replace('admin','administration');
        if(!HRMS.can(module, 'view')) a.hidden=true;
      });
      const main=document.querySelector('main');
      if(main && !document.querySelector('.account-chip')){
        const chip=document.createElement('div'); chip.className='account-chip';
        chip.innerHTML=`<span><b>${esc(HRMS.user.name || HRMS.user.email)}</b><small>${esc(HRMS.user.role.toUpperCase())}</small></span><button class="secondary" id="changePwdBtn">Password</button><button class="secondary" id="logoutBtn">Logout</button>`;
        main.prepend(chip);
        document.getElementById('changePwdBtn').onclick=()=>HRMS.modal('Change Password',[{name:'current_password',label:'Current Password',type:'password',required:true},{name:'new_password',label:'New Password (10+ characters)',type:'password',required:true}],{},async obj=>{await HRMS.api('/api/auth/change-password',{method:'POST',body:JSON.stringify(obj)});HRMS.toast('Password changed');});
        document.getElementById('logoutBtn').onclick=async()=>{await HRMS.api('/api/auth/logout',{method:'POST'});location.href='login.html';};
      }
      document.dispatchEvent(new CustomEvent('hrms:ready',{detail:HRMS.user}));
    }
  };

  function esc(v){ return String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  HRMS.esc=esc;

  function initLogin(){
    const form=document.getElementById('loginForm'); if(!form)return;
    form.onsubmit=async e=>{e.preventDefault();const btn=form.querySelector('button');btn.disabled=true;document.getElementById('loginError').textContent='';
      try{const data=Object.fromEntries(new FormData(form).entries());await HRMS.api('/api/auth/login',{method:'POST',body:JSON.stringify(data)});location.href='index.html';}
      catch(err){document.getElementById('loginError').textContent=err.message;btn.disabled=false;}
    };
  }

  window.addEventListener('DOMContentLoaded',()=>HRMS.init());
})();
