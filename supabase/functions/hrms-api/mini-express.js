function compileRoute(pattern) {
  const keys=[];
  const parts=pattern.split('/').filter(Boolean).map(p=>{
    if(p.startsWith(':')){keys.push(p.slice(1));return '([^/]+)';}
    return p.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  });
  return { regex:new RegExp('^/'+parts.join('/')+'/?$'), keys };
}

function enhanceRes(res) {
  res.status = code => { res.statusCode=code; return res; };
  res.json = obj => { if(!res.headersSent) res.setHeader('Content-Type','application/json; charset=utf-8'); res.end(JSON.stringify(obj)); };
  res.send = data => {
    if(typeof data === 'object' && data !== null) return res.json(data);
    if(!res.headersSent) res.setHeader('Content-Type','text/html; charset=utf-8');
    res.end(String(data ?? ''));
  };
}

function createApp() {
  const stack=[];
  function add(method,pattern,handlers){ const c=compileRoute(pattern); stack.push({type:'route',method,pattern,...c,handlers}); }
  const app=(req,res)=>handle(req,res);
  ['GET','POST','PATCH','PUT','DELETE'].forEach(method=>{ app[method.toLowerCase()] = (pattern,...handlers)=>add(method,pattern,handlers.flat()); });
  app.use=(prefix,fn)=>{
    if(typeof prefix==='function'){fn=prefix;prefix='';}
    stack.push({type:'middleware',prefix,fn});
  };

  function handle(req,res){
    enhanceRes(res);
    const url=new URL(req.url,'http://localhost');
    req.path=decodeURIComponent(url.pathname);
    req.query=Object.fromEntries(url.searchParams.entries());
    req.params={};
    let idx=0;
    const dispatch=()=>{
      if(res.writableEnded) return;
      if(idx>=stack.length){res.statusCode=404;return res.end('Not found');}
      const layer=stack[idx++];
      if(layer.type==='middleware'){
        if(layer.prefix && !req.path.startsWith(layer.prefix)) return dispatch();
        const oldUrl=req.url, oldPath=req.path;
        if(layer.prefix){req.url=req.url.slice(layer.prefix.length)||'/';req.path=req.path.slice(layer.prefix.length)||'/';}
        return invoke([layer.fn],0,()=>{req.url=oldUrl;req.path=oldPath;dispatch();});
      }
      if(layer.method!==req.method) return dispatch();
      const m=layer.regex.exec(req.path); if(!m) return dispatch();
      req.params={}; layer.keys.forEach((k,i)=>req.params[k]=decodeURIComponent(m[i+1]));
      return invoke(layer.handlers,0,dispatch);

      function invoke(handlers,i,nextLayer){
        if(res.writableEnded) return;
        if(i>=handlers.length) return nextLayer();
        const fn=handlers[i];
        try{
          const out=fn(req,res,()=>invoke(handlers,i+1,nextLayer));
          if(out && typeof out.then==='function') out.catch(err=>{console.error(err);if(!res.writableEnded)res.status(500).json({error:'Server error'});});
        }catch(err){console.error(err);if(!res.writableEnded)res.status(500).json({error:'Server error'});}
      }
    };
    dispatch();
  }
  return app;
}

createApp.json = () => (req,res,next)=>{
  if(req.body === undefined) req.body={};
  next();
};
createApp.urlencoded = () => (req,res,next)=>{
  if(req.body === undefined) req.body={};
  next();
};
export default createApp;
