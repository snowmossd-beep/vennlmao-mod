(function(){
'use strict';
var ROOT=new URL('../',document.currentScript.src).href;
var $=function(s){return document.querySelector(s)};
var core=window.GlooCore,Viewer=window.WallViewer;
var el={
  device:$('#sel-device'),ff:$('#sel-ff'),pnote:$('#plat-note'),
  s2:$('#s2'),s3:$('#s3'),s4:$('#s4'),skins:$('#skins'),
  file:$('#file'),fname:$('#file-name'),zoom:$('#zoom'),center:$('#center'),fnote:$('#file-note'),
  go:$('#go'),gnote:$('#go-note'),prog:$('#prog'),bar:$('#bar'),pt:$('#prog-t'),pp:$('#prog-p'),result:$('#result'),
  crop:$('#crop'),cv:$('#crop-cv'),cempty:$('#crop-empty'),v3d:$('#v3d-cv'),v3empty:$('#v3d-empty')
};
['s2','s3','s4'].forEach(function(id){var n=document.getElementById(id);if(n)n.classList.remove('is-locked')});
var S={cfg:null,mesh:null,tris:null,plat:null,pcfg:null,ptris:null,base:null,skin:null,img:null,busy:false,zoom:1,cx:.5,cy:.5,url:null};
var viewer=null,enc=null,t3=0,previewTimer=0;
var FW=1536,PW=640,PN=512;

function fetchJSON(u){return fetch(u).then(function(r){if(!r.ok)throw new Error('Không tải được '+u.split('/').pop());return r.json()})}
function aspect(){return S.tris?S.tris.aspect:1.6563}
function lock(node,on){node.classList.toggle('is-locked',on)}
function note(node,msg,err){node.textContent=msg||'';node.classList.toggle('err',!!err)}
function setProg(t,p){el.pt.textContent=t;el.pp.textContent=Math.round(p*100)+'%';el.bar.style.width=(p*100)+'%'}

function boot(){
  Promise.all([fetchJSON(ROOT+'gloo/config.json?v=1'),fetchJSON(ROOT+'gloo/wall.json?v=1'),fetchJSON(ROOT+'gloo/tris.json?v=1')]).then(function(a){
    S.cfg=a[0];S.mesh=a[1];S.tris=a[2];
    renderSkins();initViewer();draw();
  }).catch(function(e){note(el.pnote,'Lỗi tải dữ liệu: '+e.message,true)});
}
function initViewer(){
  try{
    viewer=new Viewer(el.v3d);
    if(!viewer.init(S.mesh)){viewer=null;el.v3empty.hidden=false;el.v3empty.textContent='Trình duyệt này không hỗ trợ xem 3D.';return}
    if('IntersectionObserver' in window){new IntersectionObserver(function(es){viewer.setActive(es[0].isIntersecting)}).observe(el.v3d)}else viewer.setActive(true);
  }catch(e){viewer=null;el.v3empty.hidden=false;el.v3empty.textContent='Không khởi tạo được xem 3D.'}
}
function renderSkins(){
  el.skins.innerHTML='';
  S.cfg.skins.forEach(function(s){
    var b=document.createElement('button');b.type='button';b.className='skin';b.setAttribute('role','radio');b.setAttribute('aria-checked','false');
    b.innerHTML='<img alt="" width="256" height="160" loading="lazy" src="'+ROOT+s.img+'"><b></b><small></small>';
    b.querySelector('b').textContent=s.name;b.querySelector('small').textContent=s.sub||'Tường keo';
    b.onclick=function(){pickSkin(s,b)};
    el.skins.appendChild(b);
  });
}
function platform(){
  if(!S.cfg)return;
  var d=el.device.value,f=el.ff.value;
  S.plat=null;S.pcfg=null;S.ptris=null;S.base=null;el.result.hidden=true;
  if(!d||!f){note(el.pnote,'');refreshGo();return}
  var p=S.cfg.platforms.filter(function(x){return x.device===d&&x.ff===f})[0];
  if(!p||!p.ready){note(el.pnote,'Chưa có dữ liệu cho cấu hình này, sẽ cập nhật sau.');refreshGo();return}
  S.plat=p;note(el.pnote,'');refreshGo();
  var base=ROOT+'gloo/'+p.id+'/';
  Promise.all([fetchJSON(base+'config.json?v=1'),fetchJSON(base+'tris.json?v=1')]).then(function(a){if(S.plat!==p)return;S.pcfg=a[0];S.ptris=a[1]}).catch(function(e){note(el.pnote,'Lỗi: '+e.message,true)});
}
function pickSkin(s,b){
  if(S.busy)return;
  S.skin=s;
  Array.prototype.forEach.call(el.skins.children,function(c){c.setAttribute('aria-checked',String(c===b))});
  refreshGo();
}
function onFile(){
  var f=el.file.files&&el.file.files[0];note(el.fnote,'');
  if(!f)return;
  if(!/^image\//.test(f.type)){note(el.fnote,'File này không phải ảnh.',true);return}
  var url=URL.createObjectURL(f),im=new Image();
  im.onload=function(){
    if(S.url)URL.revokeObjectURL(S.url);S.url=url;S.img=im;S.zoom=1;S.cx=.5;S.cy=.5;
    el.fname.textContent=f.name;el.zoom.value=1;el.zoom.disabled=false;el.center.disabled=false;el.cempty.hidden=true;
    draw();schedule3D();refreshGo();
  };
  im.onerror=function(){URL.revokeObjectURL(url);note(el.fnote,'Không đọc được ảnh, thử file JPG hoặc PNG khác.',true)};
  im.src=url;
}
function geom(fw,fh){
  var im=S.img,cover=Math.max(fw/im.naturalWidth,fh/im.naturalHeight),sc=cover*S.zoom,w=im.naturalWidth*sc,h=im.naturalHeight*sc;
  return {w:w,h:h,x:S.cx*fw-w/2,y:S.cy*fh-h/2};
}
function clamp(){
  if(!S.img)return;
  var fw=1000,fh=fw/aspect(),g=geom(fw,fh);
  var lo=(fw-g.w/2)/fw,hi=(g.w/2)/fw,lo2=(fh-g.h/2)/fh,hi2=(g.h/2)/fh;
  S.cx=Math.max(Math.min(lo,hi),Math.min(Math.max(lo,hi),S.cx));
  S.cy=Math.max(Math.min(lo2,hi2),Math.min(Math.max(lo2,hi2),S.cy));
}
function paint(ctx,fw,fh,guide){
  ctx.fillStyle='#0a0a0a';ctx.fillRect(0,0,fw,fh);
  if(!S.img)return;
  var g=geom(fw,fh);ctx.imageSmoothingQuality='high';ctx.drawImage(S.img,g.x,g.y,g.w,g.h);
  if(guide){
    var sd=fh-2,lw=Math.max(1,fw/600);ctx.save();ctx.lineWidth=lw;ctx.strokeStyle='rgba(255,255,255,.95)';ctx.setLineDash([lw*6,lw*5]);
    ctx.strokeRect((fw-sd)/2,lw/2+1,sd,sd);ctx.restore();
  }
}
function draw(){
  var box=el.crop,w=Math.max(160,box.clientWidth),h=Math.round(w/aspect()),dpr=Math.min(2,window.devicePixelRatio||1);
  el.cv.style.width=w+'px';el.cv.style.height=h+'px';el.cv.width=Math.round(w*dpr);el.cv.height=Math.round(h*dpr);
  clamp();paint(el.cv.getContext('2d'),el.cv.width,el.cv.height,true);
}
function faceData(fw){
  var fh=Math.round(fw/aspect()),c=document.createElement('canvas');c.width=fw;c.height=fh;
  var ctx=c.getContext('2d',{willReadFrequently:true});paint(ctx,fw,fh,false);
  return {fw:fw,fh:fh,data:new Uint8Array(ctx.getImageData(0,0,fw,fh).data.buffer)};
}
function schedule3D(){
  if(!viewer||!S.img||!core)return;
  clearTimeout(previewTimer);
  previewTimer=setTimeout(function(){
    var f=faceData(PW),px=core.bakeWall(S.tris.tris,f.data,f.fw,f.fh,PN);
    viewer.setTexture(px,PN,PN);
  },90);
}
function onChange(){draw();schedule3D()}
function setZoom(z){S.zoom=Math.max(1,Math.min(5,z));el.zoom.value=S.zoom;onChange()}
function bindCrop(){
  var box=el.crop,pts={},last=null,d0=0,z0=1;
  box.addEventListener('pointerdown',function(e){if(!S.img)return;box.setPointerCapture(e.pointerId);pts[e.pointerId]={x:e.clientX,y:e.clientY};var k=Object.keys(pts);if(k.length===2){d0=Math.hypot(pts[k[0]].x-pts[k[1]].x,pts[k[0]].y-pts[k[1]].y);z0=S.zoom}last={x:e.clientX,y:e.clientY}});
  box.addEventListener('pointermove',function(e){
    if(!S.img||!pts[e.pointerId])return;
    var k=Object.keys(pts);pts[e.pointerId]={x:e.clientX,y:e.clientY};
    if(k.length>=2){var d=Math.hypot(pts[k[0]].x-pts[k[1]].x,pts[k[0]].y-pts[k[1]].y);if(d0>0)setZoom(z0*d/d0);return}
    var r=box.getBoundingClientRect();S.cx+=(e.clientX-last.x)/r.width;S.cy+=(e.clientY-last.y)/r.height;last={x:e.clientX,y:e.clientY};onChange();
  });
  function up(e){delete pts[e.pointerId];var k=Object.keys(pts);if(k.length===1)last={x:pts[k[0]].x,y:pts[k[0]].y}}
  box.addEventListener('pointerup',up);box.addEventListener('pointercancel',up);
  box.addEventListener('wheel',function(e){if(!S.img)return;e.preventDefault();setZoom(S.zoom*(e.deltaY<0?1.07:1/1.07))},{passive:false});
  box.addEventListener('keydown',function(e){
    if(!S.img)return;var st=.02,h=true;
    if(e.key==='ArrowLeft')S.cx+=st;else if(e.key==='ArrowRight')S.cx-=st;else if(e.key==='ArrowUp')S.cy+=st;else if(e.key==='ArrowDown')S.cy-=st;
    else if(e.key==='+'||e.key==='=')setZoom(S.zoom*1.08);else if(e.key==='-')setZoom(S.zoom/1.08);else h=false;
    if(h){e.preventDefault();onChange()}
  });
}
function refreshGo(){
  var miss=[];
  if(!el.device.value||!el.ff.value)miss.push('thiết bị và Free Fire');
  else if(!S.plat)miss.push('cấu hình có dữ liệu');
  if(!S.skin)miss.push('bom keo');
  if(!S.img)miss.push('ảnh');
  el.go.disabled=miss.length>0||S.busy;
  note(el.gnote,miss.length?'Còn thiếu: '+miss.join(', ')+'.':'');
}
function loadEncoder(){
  if(window.__glooEncoder)return Promise.resolve(window.__glooEncoder);
  if(enc)return enc;
  enc=import(ROOT+'gloo/vendor/astc/index.mjs').then(function(m){
    var ctx=new m.ASTCContext(new m.ASTCConfig(m.ASTCProfile.LDR,8,8,1,m.ASTCQualityPreset.MEDIUM)),sw=new m.ASTCSwizzle();
    return function(rgba,w,h){return ctx.compress(new m.ASTCImage(m.ASTCType.U8,w,h,1,rgba),sw).then(function(r){return new Uint8Array(r)})};
  });
  enc.catch(function(){enc=null});
  return enc;
}
function mb(n){return (n/1048576).toFixed(1).replace('.',',')+' MB'}
async function go(){
  if(S.busy||!S.img||!S.skin||!S.plat)return;
  S.busy=true;refreshGo();el.device.disabled=true;el.ff.disabled=true;
  el.result.hidden=true;el.result.className='result';el.prog.hidden=false;setProg('Tải dữ liệu gốc',.02);
  try{
    if(!S.pcfg||!S.ptris){var b=ROOT+'gloo/'+S.plat.id+'/';var a=await Promise.all([fetchJSON(b+'config.json?v=1'),fetchJSON(b+'tris.json?v=1')]);S.pcfg=a[0];S.ptris=a[1]}
    if(!S.base){var r=await fetch(ROOT+'gloo/'+S.plat.id+'/base.bin?v=1');if(!r.ok)throw new Error('Không tải được file gốc');S.base=new Uint8Array(await r.arrayBuffer())}
    if(S.base.length!==S.pcfg.size)throw new Error('File gốc không đúng dung lượng');
    setProg('Nạp bộ nén ASTC',.06);
    var encode=await loadEncoder();
    setProg('Xử lý ảnh',.1);
    var f=faceData(FW);
    var out=await core.buildMod({base:S.base,config:S.pcfg,tris:S.ptris.tris,face:f.data,fw:f.fw,fh:f.fh,encode:encode,onProgress:function(p){setProg('Nén texture',.1+p*.85)}});
    setProg('Đóng gói',.97);
    var url=URL.createObjectURL(new Blob([out],{type:'application/octet-stream'}));
    el.result.innerHTML='<p>Đã tạo xong, '+mb(out.length)+'</p><code class="name"></code><a class="btn btn-primary" id="dl">Tải file mod</a>';
    el.result.querySelector('.name').textContent=S.pcfg.fileName;
    var a2=el.result.querySelector('#dl');a2.href=url;a2.download=S.pcfg.fileName;
    el.result.hidden=false;setProg('Xong',1);
  }catch(err){
    el.result.className='result bad';el.result.textContent=(err&&err.message)?err.message:String(err);el.result.hidden=false;
  }finally{
    S.busy=false;el.device.disabled=false;el.ff.disabled=false;refreshGo();
  }
}
el.device.addEventListener('change',platform);el.ff.addEventListener('change',platform);
el.file.addEventListener('change',onFile);
el.zoom.addEventListener('input',function(e){setZoom(parseFloat(e.target.value))});
el.center.addEventListener('click',function(){S.cx=.5;S.cy=.5;setZoom(1)});
el.go.addEventListener('click',go);
window.addEventListener('resize',function(){draw()});
bindCrop();refreshGo();boot();
})();
