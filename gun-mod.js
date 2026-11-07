(function(){
'use strict';
var CFG={catalog:'guns/catalog.json',patchBase:'guns/patch/',ver:'1'};
var cat=null,curGun=null,query='',busy=false,coreP=null,sel=null,info=null,carrierFile=null,carrierBuf=null;
function $(s,r){return (r||document).querySelector(s)}
function el(tag,cls,html){var e=document.createElement(tag);if(cls)e.className=cls;if(html!=null)e.innerHTML=html;return e}
function esc(s){return String(s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function norm(s){return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim()}
function loadScript(src){return new Promise(function(res,rej){var s=document.createElement('script');s.src=src+'?v='+CFG.ver;s.onload=res;s.onerror=function(){rej(new Error('Không tải được '+src))};document.head.appendChild(s)})}
function loadCore(){
  if(coreP)return coreP;
  coreP=loadScript('fflate.umd.js').then(function(){return loadScript('lzma-js.min.js')}).then(function(){return loadScript('gunmod-core.js')});
  coreP.catch(function(){coreP=null});return coreP;
}
function init(){
  var header=$('header.topbar')||$('.topbar');
  var intro=$('#wardrobe-intro'),work=$('#wardrobe-workspace');
  if(!header||!work)return;
  var nav=el('nav','gm-tabs');nav.setAttribute('role','tablist');
  nav.innerHTML='<button class="gm-tab" role="tab" id="gm-tab-wardrobe" aria-selected="true" type="button"><span class="gm-ico">👗</span>Mod đồ</button><button class="gm-tab" role="tab" id="gm-tab-gun" aria-selected="false" type="button"><span class="gm-ico">🔫</span>Mod skin súng</button>';
  header.parentNode.insertBefore(nav,header.nextSibling);
  var sec=el('section');sec.id='gun-mod';sec.hidden=true;
  sec.innerHTML='<div class="gm-note"><span>📱</span><span>Mod skin súng hiện chỉ dành cho <b>iOS · Free Fire MAX</b>. Web tự tạo file ngay trên trình duyệt từ file bundle gốc trên máy bạn (không gửi file đi đâu).</span></div><div class="gm-bar"><button class="gm-back" id="gm-back" type="button" hidden>← Tất cả súng</button><label class="gm-search"><span>🔎</span><input id="gm-q" type="search" placeholder="Tìm súng hoặc skin súng (vd: AK47, Mambas, Vũ trụ...)" autocomplete="off"></label></div><div id="gm-body"></div>';
  work.parentNode.insertBefore(sec,work.nextSibling);
  var modal=el('div','gm-modal');modal.id='gm-modal';modal.hidden=true;
  modal.innerHTML='<div class="gm-dialog" role="dialog" aria-modal="true" aria-labelledby="gm-mt"><button class="gm-x" id="gm-x" type="button" aria-label="Đóng">×</button><div class="gm-head"><img id="gm-mi" alt=""><div><h3 id="gm-mt"></h3><p id="gm-ms"></p></div></div><div class="gm-step"><h4>Bước 1 · Chọn file bundle gốc</h4><p>Chọn đúng file <code>optionalab_weapon_…</code> của một skin súng bạn đang có, trong thư mục <code>gameassetbundles</code> của Free Fire MAX.</p><input id="gm-file" type="file"><div class="gm-info" id="gm-fi"></div></div><div class="gm-step"><h4>Bước 2 · Skin gốc sẽ bị thay</h4><p>Chọn skin trong file đó mà bạn đang trang bị. Skin này sẽ hiển thị như skin bạn chọn.</p><select id="gm-carrier" disabled><option>— chọn file trước —</option></select></div><div class="gm-step"><h4>Bước 3 · Cách tạo file</h4><label class="gm-radio"><input type="radio" name="gm-mode" value="normal" checked><span>Nén (khuyên dùng)<small>Giữ dung lượng gần bằng file gốc. Có thể mất 1–3 phút trên điện thoại.</small></span></label><label class="gm-radio"><input type="radio" name="gm-mode" value="fast"><span>Nhanh<small>Không nén, tạo trong vài giây nhưng file lớn hơn file gốc.</small></span></label></div><button class="gm-go" id="gm-go" type="button" disabled>Tạo file mod</button><div class="gm-prog" id="gm-prog" hidden><div class="gm-track"><div class="gm-fill" id="gm-fill"></div></div><div class="gm-pstep"><span id="gm-pst">Đang xử lý…</span><span id="gm-ppc">0%</span></div></div><div class="gm-result" id="gm-res" hidden></div><div class="gm-warn">Sửa file game vi phạm điều khoản của Garena và có thể bị khóa tài khoản. Chỉ dùng cho mục đích hiển thị cá nhân, sao lưu file gốc trước khi thay.</div></div>';
  document.body.appendChild(modal);
  var tabW=$('#gm-tab-wardrobe'),tabG=$('#gm-tab-gun');
  function show(which){
    var g=which==='gun';
    if(intro)intro.style.display=g?'none':'';work.style.display=g?'none':'grid';sec.hidden=!g;
    tabW.setAttribute('aria-selected',String(!g));tabG.setAttribute('aria-selected',String(g));
    if(g){ensureCatalog();history.replaceState(null,'','#mod-sung')}else{history.replaceState(null,'',location.pathname+location.search)}
  }
  tabW.onclick=function(){show('wardrobe')};tabG.onclick=function(){show('gun')};
  $('#gm-q').addEventListener('input',function(e){query=e.target.value;render()});
  $('#gm-back').onclick=function(){curGun=null;render();window.scrollTo({top:sec.offsetTop-10,behavior:'smooth'})};
  $('#gm-x').onclick=closeModal;
  modal.addEventListener('click',function(e){if(e.target===modal)closeModal()});
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!modal.hidden)closeModal()});
  $('#gm-file').addEventListener('change',onFile);
  $('#gm-carrier').addEventListener('change',updateGo);
  $('#gm-go').onclick=run;
  window.addEventListener('hashchange',function(){if(location.hash==='#mod-sung')show('gun')});
  if(location.hash==='#mod-sung')show('gun');
}
function ensureCatalog(){
  if(cat){render();return}
  var b=$('#gm-body');b.innerHTML='<div class="gm-empty">Đang tải danh sách skin súng…</div>';
  fetch(CFG.catalog+'?v='+CFG.ver).then(function(r){if(!r.ok)throw new Error(r.status);return r.json()}).then(function(j){cat=j;index();render()}).catch(function(){b.innerHTML='<div class="gm-empty">Không tải được danh sách skin. Kiểm tra file guns/catalog.json.</div>'});
}
var ALIAS=[['digitaluniverse','vu tru so vu tru'],['mambas','phong xa'],['dinosaur','khung long'],['dragon','rong'],['wolf','soi'],['cat','meo'],['fox','cao'],['tiger','ho'],['jaguar','bao bao den'],['skeleton','xuong'],['skull','so lo'],['ghost','ma'],['fire','lua'],['flame','lua'],['ice','bang'],['gold','vang'],['demon','quy'],['angel','thien than'],['snake','ran'],['halloween','halloween le hoi'],['cyber','cyber robot'],['lava','dung nham'],['ninja','nin ja'],['samurai','kiem si'],['storm','bao'],['lightning','set']];
var flat=[];
function aliasOf(t){t=t.toLowerCase();var o=[];ALIAS.forEach(function(a){if(t.indexOf(a[0])>=0)o.push(a[1])});return o.join(' ')}
function index(){
  flat=[];
  cat.guns.forEach(function(g){g.skins.forEach(function(s){flat.push({g:g,s:s,key:norm(g.name+' '+s.n+' '+s.k+' '+aliasOf(s.k))})});g.nk=norm(g.name)});
}
function gunCard(g){
  var b=el('button','gm-item');b.type='button';
  var ok=g.skins.filter(function(s){return s.p}).length;
  b.innerHTML=(g.thumb?'<img class="gm-img" loading="lazy" alt="" src="guns/'+esc(g.thumb)+'">':'<div class="gm-noimg">'+esc(g.name)+'</div>')+'<div class="gm-meta"><span class="gm-name">'+esc(g.name)+'</span><span class="gm-sub">'+g.count+' skin · '+ok+' sẵn sàng</span></div>';
  b.onclick=function(){curGun=g;query='';$('#gm-q').value='';render();window.scrollTo({top:$('#gun-mod').offsetTop-10,behavior:'smooth'})};
  return b;
}
function skinCard(g,s,showGun){
  var b=el('button','gm-item'+(s.p?'':' gm-disabled'));b.type='button';
  b.innerHTML=(s.img?'<img class="gm-img" loading="lazy" alt="" src="guns/'+esc(s.img)+'">':'<div class="gm-noimg">Chưa có ảnh</div>')+'<span class="gm-badge'+(s.p?'':' gm-off')+'">'+(s.p?'Sẵn sàng':(s.w==='v22'?'Chưa hỗ trợ':'Chưa có'))+'</span><div class="gm-meta"><span class="gm-name">'+esc(s.n)+'</span><span class="gm-sub">'+(showGun?esc(g.name):esc(g.name)+' · '+(g.kind==='SW'?'súng phụ':'súng chính'))+'</span></div>';
  b.onclick=function(){openModal(g,s)};
  return b;
}
function render(){
  var body=$('#gm-body'),back=$('#gm-back');body.innerHTML='';
  if(!cat)return;
  var q=norm(query);
  back.hidden=!curGun&&!q;
  if(q){
    back.onclick=function(){query='';$('#gm-q').value='';curGun=null;render()};
    var guns=cat.guns.filter(function(g){return g.nk.indexOf(q)>=0});
    var skins=flat.filter(function(x){return x.key.indexOf(q)>=0}).slice(0,150);
    if(guns.length){body.appendChild(el('div','gm-sec','Súng'));var gg=el('div','gm-grid gm-gunsgrid');guns.forEach(function(g){gg.appendChild(gunCard(g))});body.appendChild(gg)}
    if(skins.length){body.appendChild(el('div','gm-sec','Skin súng ('+skins.length+(skins.length===150?'+':'')+')'));var sg=el('div','gm-grid');skins.forEach(function(x){sg.appendChild(skinCard(x.g,x.s,false))});body.appendChild(sg)}
    if(!guns.length&&!skins.length)body.appendChild(el('div','gm-empty','Không tìm thấy kết quả cho "'+esc(query)+'"'));
    return;
  }
  back.onclick=function(){curGun=null;render()};
  if(curGun){
    var ok=curGun.skins.filter(function(s){return s.p}).length;
    body.appendChild(el('div','gm-title',esc(curGun.name)+'<small>'+curGun.count+' skin · '+ok+' sẵn sàng</small>'));
    var grid=el('div','gm-grid');curGun.skins.forEach(function(s){grid.appendChild(skinCard(curGun,s,true))});body.appendChild(grid);
  }else{
    body.appendChild(el('div','gm-title','Chọn súng<small>'+cat.guns.length+' loại súng · '+flat.length+' skin</small>'));
    var gg2=el('div','gm-grid gm-gunsgrid');cat.guns.forEach(function(g){gg2.appendChild(gunCard(g))});body.appendChild(gg2);
  }
}
function openModal(g,s){
  if(!s.p){toast(s.w==='v22'?'Skin này nằm trong bundle phiên bản mới, tạm thời chưa hỗ trợ.':'Skin này chưa có dữ liệu mod.');return}
  sel={g:g,s:s};info=null;carrierFile=null;carrierBuf=null;
  $('#gm-mt').textContent=g.name+' · '+s.n;$('#gm-ms').textContent=(g.kind==='SW'?'Súng phụ':'Súng chính')+' · bản iOS MAX';
  var im=$('#gm-mi');if(s.img){im.src='guns/'+s.img;im.hidden=false}else im.hidden=true;
  $('#gm-file').value='';$('#gm-fi').textContent='';$('#gm-fi').className='gm-info';
  var c=$('#gm-carrier');c.innerHTML='<option>— chọn file trước —</option>';c.disabled=true;
  $('#gm-go').disabled=true;$('#gm-prog').hidden=true;$('#gm-res').hidden=true;
  $('#gm-modal').hidden=false;document.body.style.overflow='hidden';
  loadCore().catch(function(e){var f=$('#gm-fi');f.textContent=e.message;f.className='gm-info gm-err'});
}
function closeModal(){
  if(busy&&!confirm('Đang tạo file. Đóng bây giờ sẽ hủy. Vẫn đóng?'))return;
  $('#gm-modal').hidden=true;document.body.style.overflow='';busy=false;
}
function toast(msg){alert(msg)}
function setProg(stage,f){
  $('#gm-fill').style.width=Math.round(f*100)+'%';$('#gm-ppc').textContent=Math.round(f*100)+'%';$('#gm-pst').textContent=stage;
}
async function onFile(e){
  var f=e.target.files&&e.target.files[0];if(!f)return;
  var fi=$('#gm-fi');fi.className='gm-info';fi.textContent='Đang đọc '+f.name+'…';
  var c=$('#gm-carrier');c.disabled=true;$('#gm-go').disabled=true;
  try{
    await loadCore();
    carrierBuf=new Uint8Array(await f.arrayBuffer());carrierFile=f;
    info=await window.GunMod.inspectCarrier(carrierBuf,function(){});
    info.origBuf=carrierBuf;
    var labels=Object.keys(info.labels);
    if(!labels.length)throw new Error('File này không chứa skin súng nào.');
    var gk=norm(sel.g.name).replace(/ /g,'');
    labels.sort(function(a,b){var A=norm(a).replace(/ /g,'').indexOf(gk)>=0?0:1,B=norm(b).replace(/ /g,'').indexOf(gk)>=0?0:1;return A-B||a.localeCompare(b)});
    c.innerHTML='';
    labels.forEach(function(l){var o=document.createElement('option');o.value=l;o.textContent=l.replace(/_/g,' ')+'  ('+info.labels[l].join(', ')+')';c.appendChild(o)});
    c.disabled=false;
    fi.textContent='✔ '+f.name+' · '+(f.size/1048576).toFixed(1)+' MB · '+labels.length+' skin ('+info.meta.unity+')';
    updateGo();
  }catch(err){info=null;fi.className='gm-info gm-err';fi.textContent='✖ '+(err&&err.message?err.message:err);c.disabled=true;$('#gm-go').disabled=true}
}
function updateGo(){$('#gm-go').disabled=!(info&&$('#gm-carrier').value)||busy}
async function run(){
  if(busy||!info||!sel)return;
  busy=true;$('#gm-go').disabled=true;$('#gm-res').hidden=true;$('#gm-prog').hidden=false;setProg('Tải dữ liệu skin',0.02);
  try{
    var pf=sel.s.f;
    var r=await fetch(CFG.patchBase+encodeURIComponent(pf)+'?v='+CFG.ver);
    if(!r.ok)throw new Error('Không tải được dữ liệu skin ('+r.status+')');
    var patchBuf=new Uint8Array(await r.arrayBuffer());
    var mode=($('input[name=gm-mode]:checked')||{}).value||'normal';
    var res=await window.GunMod.buildMod(carrierBuf,patchBuf,$('#gm-carrier').value,mode,function(st,p){setProg(st,p)},info);
    var blob=new Blob([res.file],{type:'application/octet-stream'});
    var url=URL.createObjectURL(blob);
    var name=carrierFile.name;
    var res_=$('#gm-res');res_.className='gm-result';
    var sizeTxt=(res.file.length/1048576).toFixed(2)+' MB (gốc '+(res.origSize/1048576).toFixed(2)+' MB)';
    var warn=res.notes&&res.notes.nulled?'<br>Lưu ý: '+res.notes.nulled+' tham chiếu hiệu ứng ngoài bundle bị bỏ vì file gốc không có.':'';
    res_.innerHTML='✔ Đã tạo xong · '+esc(sizeTxt)+warn+'<br>Thay file này vào đúng vị trí file gốc (giữ nguyên tên) rồi mở lại game.<br><a id="gm-dl" href="'+url+'" download="'+esc(name)+'">⬇ Tải file '+esc(name.length>46?name.slice(0,22)+'…'+name.slice(-18):name)+'</a>';
    res_.hidden=false;setProg('Xong',1);
    var a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
  }catch(err){
    var rr=$('#gm-res');rr.className='gm-result gm-bad';rr.textContent='✖ '+(err&&err.message?err.message:err);rr.hidden=false;
  }finally{busy=false;updateGo()}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
