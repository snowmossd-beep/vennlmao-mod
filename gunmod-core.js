(function(root){
'use strict';
var LZMA_=null,FFLATE_=null;
function lz(){if(LZMA_)return LZMA_;LZMA_=(typeof window!=='undefined'&&window.LZMA)?window.LZMA:require('lzma');return LZMA_}
function ff(){if(FFLATE_)return FFLATE_;FFLATE_=(typeof window!=='undefined'&&window.fflate)?window.fflate:require('fflate');return FFLATE_}
var TD=new TextDecoder('utf-8'),TE=new TextEncoder();
function align(n,a){return (n+a-1)&~(a-1)}
function cstr(u8,p){var q=p;while(u8[q]!==0)q++;return [TD.decode(u8.subarray(p,q)),q+1]}
function dvOf(u8){return new DataView(u8.buffer,u8.byteOffset,u8.byteLength)}
function lz4Decompress(src,dstSize){
  var dst=new Uint8Array(dstSize),si=0,di=0,n=src.length;
  while(si<n){
    var tok=src[si++],lit=tok>>4;
    if(lit===15){var b;do{b=src[si++];lit+=b}while(b===255)}
    dst.set(src.subarray(si,si+lit),di);si+=lit;di+=lit;
    if(si>=n)break;
    var off=src[si]|(src[si+1]<<8);si+=2;
    var ml=tok&15;
    if(ml===15){var c;do{c=src[si++];ml+=c}while(c===255)}
    ml+=4;var ms=di-off;
    for(var i=0;i<ml;i++)dst[di++]=dst[ms++];
  }
  return dst;
}
function lzmaDecompress(raw,usize){
  return new Promise(function(res,rej){
    var arr=new Array(13+raw.length-5);
    for(var i=0;i<5;i++)arr[i]=raw[i];
    var s=usize;for(var j=0;j<8;j++){arr[5+j]=s%256;s=Math.floor(s/256)}
    for(var k=5;k<raw.length;k++)arr[8+k]=raw[k];
    lz().decompress(arr,function(out,err){
      if(err)return rej(err);
      if(typeof out==='string'){var u=new Uint8Array(out.length);for(var t=0;t<out.length;t++)u[t]=out.charCodeAt(t)&255;return res(u)}
      var u8=new Uint8Array(out.length);for(var q=0;q<out.length;q++)u8[q]=out[q]&255;res(u8);
    });
  });
}
function lzmaCompress(u8,mode,onprog){
  return new Promise(function(res,rej){
    var arr=Array.prototype.slice.call(u8);
    lz().compress(arr,mode,function(out,err){
      if(err)return rej(err);
      var o=new Uint8Array(out.length-8);
      for(var i=0;i<5;i++)o[i]=out[i]&255;
      for(var k=13;k<out.length;k++)o[k-8]=out[k]&255;
      res(o);
    },function(p){if(onprog)onprog(p)});
  });
}
async function decodeBlock(seg,flag,usize){
  var c=flag&0x3f;
  if(c===0)return seg;
  if(c===1)return await lzmaDecompress(seg,usize);
  if(c===2||c===3)return lz4Decompress(seg,usize);
  throw new Error('nén '+c+' chưa hỗ trợ');
}
function parseFS(u8){
  var dv=dvOf(u8),p=0,r;
  r=cstr(u8,p);var sig=r[0];p=r[1];
  if(sig!=='UnityFS')throw new Error('Không phải file Unity bundle (UnityFS)');
  var ver=dv.getUint32(p);p+=4;
  r=cstr(u8,p);p=r[1];r=cstr(u8,p);p=r[1];
  var size=Number(dv.getBigInt64(p));p+=8;
  var cs=dv.getUint32(p),us=dv.getUint32(p+4),flags=dv.getUint32(p+8);p+=12;
  return {ver:ver,size:size,cs:cs,us:us,flags:flags,hdrEnd:p};
}
async function decodeBundle(u8,onprog){
  var h=parseFS(u8),flags=h.flags,biRaw;
  if(flags&0x80){var end=Math.min(h.size,u8.length);biRaw=u8.subarray(end-h.cs,end)}
  else{var bs=(flags&0x200)?align(h.hdrEnd,16):h.hdrEnd;biRaw=u8.subarray(bs,bs+h.cs)}
  var bi=await decodeBlock(biRaw,flags,h.us),dv=dvOf(bi),p=16;
  var bc=dv.getUint32(p);p+=4;var blocks=[];
  for(var i=0;i<bc;i++){blocks.push({u:dv.getUint32(p),c:dv.getUint32(p+4),f:dv.getUint16(p+8)});p+=10}
  var nc=dv.getUint32(p);p+=4;var nodes=[];
  for(var j=0;j<nc;j++){
    var off=Number(dv.getBigInt64(p)),sz=Number(dv.getBigInt64(p+8)),fl=dv.getUint32(p+16);p+=20;
    var rr=cstr(bi,p);p=rr[1];nodes.push({off:off,size:sz,flags:fl,name:rr[0]});
  }
  var pos0=(flags&0x80)?h.hdrEnd:(((flags&0x200)?align(h.hdrEnd,16):h.hdrEnd)+h.cs);
  var cands=[pos0];if(pos0%16)cands.push(align(pos0,16));if(h.hdrEnd%16)cands.push(align(h.hdrEnd,16));
  var total=0;blocks.forEach(function(b){total+=b.u});
  var data=null,lastErr=null;
  for(var ci=0;ci<cands.length&&!data;ci++){
    try{
      var out=new Uint8Array(total),q=cands[ci],o=0,ok=true;
      for(var bi2=0;bi2<blocks.length;bi2++){
        var b=blocks[bi2],seg=u8.subarray(q,q+b.c),d=await decodeBlock(seg,b.f,b.u);
        if(d.length!==b.u){ok=false;break}
        out.set(d,o);o+=b.u;q+=b.c;
        if(onprog)onprog((bi2+1)/blocks.length);
      }
      if(ok)data=out;
    }catch(e){lastErr=e}
  }
  if(!data)throw new Error('Không giải nén được bundle'+(lastErr?': '+lastErr.message:''));
  nodes.forEach(function(n){n.data=data.subarray(n.off,n.off+n.size)});
  return {header:h,nodes:nodes,fileLen:u8.length};
}
function parseMeta(u8){
  var dv=dvOf(u8),r={};
  r.ms=dv.getUint32(0);r.fs=dv.getUint32(4);r.ver=dv.getUint32(8);r.dataOff=dv.getUint32(12);
  if(u8[16]!==0)throw new Error('serialized big-endian chưa hỗ trợ');
  if(r.ver!==17)throw new Error('serialized version '+r.ver+' chưa hỗ trợ (cần 17)');
  var p=20,t=cstr(u8,p);r.unity=t[0];p=t[1];
  r.platform=dv.getInt32(p,true);p+=4;r.ett=u8[p];p+=1;
  var tc=dv.getInt32(p,true);p+=4;r.types=[];
  for(var i=0;i<tc;i++){
    var s=p,cid=dv.getInt32(p,true);p+=4;p+=1;p+=2;
    if(cid===114)p+=16;
    var oh=u8.subarray(p,p+16);p+=16;
    if(r.ett){var nc=dv.getInt32(p,true),sb=dv.getInt32(p+4,true);p+=8;p+=nc*24+sb}
    r.types.push({cid:cid,hash:hex(oh),start:s,end:p});
  }
  r.typesEnd=p;
  var oc=dv.getInt32(p,true);p+=4;r.objs=[];
  for(var k=0;k<oc;k++){
    p=align(p,4);
    r.objs.push({pid:dv.getBigInt64(p,true),start:dv.getUint32(p+8,true),size:dv.getUint32(p+12,true),tid:dv.getInt32(p+16,true)});p+=20;
  }
  var sc=dv.getInt32(p,true);p+=4;r.scripts=[];
  for(var m=0;m<sc;m++){p=align(p,4);r.scripts.push({fi:dv.getInt32(p,true),id:dv.getBigInt64(p+4,true)});p+=12}
  var ec=dv.getInt32(p,true);p+=4;r.exts=[];
  for(var e=0;e<ec;e++){
    var s2=p;var a=cstr(u8,p);p=a[1];var g=u8.subarray(p,p+16);p+=16;var ty=dv.getInt32(p,true);p+=4;var pa=cstr(u8,p);p=pa[1];
    r.exts.push({start:s2,end:p,path:pa[0],type:ty,guid:g});
  }
  r.extEnd=p;r.tail=u8.subarray(p,20+r.ms);
  return r;
}
function hex(u8){var s='';for(var i=0;i<u8.length;i++)s+=(u8[i]<16?'0':'')+u8[i].toString(16);return s}
function fromHex(h){var o=new Uint8Array(h.length/2);for(var i=0;i<o.length;i++)o[i]=parseInt(h.substr(i*2,2),16);return o}
function readAB(u8){
  var dv=dvOf(u8),p=0;
  function str(){var l=dv.getUint32(p,true);p+=4;var s=TD.decode(u8.subarray(p,p+l));p+=l;p=align(p,4);return s}
  var ab={};ab.name=str();
  var pc=dv.getInt32(p,true);p+=4;ab.preload=[];
  for(var i=0;i<pc;i++){ab.preload.push({f:dv.getInt32(p,true),id:dv.getBigInt64(p+4,true)});p+=12}
  var cc=dv.getInt32(p,true);p+=4;ab.cont=[];
  for(var j=0;j<cc;j++){var k=str();var pi=dv.getInt32(p,true),ps=dv.getInt32(p+4,true),fi=dv.getInt32(p+8,true),id=dv.getBigInt64(p+12,true);p+=20;ab.cont.push({key:k,pi:pi,ps:ps,f:fi,id:id})}
  ab.rest=u8.subarray(p);
  return ab;
}
function writeAB(ab){
  var parts=[],len=0;
  function push(u){parts.push(u);len+=u.length}
  function i32(v){var b=new Uint8Array(4);new DataView(b.buffer).setInt32(0,v,true);push(b)}
  function str(s){var e=TE.encode(s);i32(e.length);push(e);var pad=align(e.length,4)-e.length;if(pad)push(new Uint8Array(pad))}
  str(ab.name);i32(ab.preload.length);
  ab.preload.forEach(function(x){var b=new Uint8Array(12),d=new DataView(b.buffer);d.setInt32(0,x.f,true);d.setBigInt64(4,x.id,true);push(b)});
  i32(ab.cont.length);
  ab.cont.forEach(function(c){str(c.key);var b=new Uint8Array(20),d=new DataView(b.buffer);d.setInt32(0,c.pi,true);d.setInt32(4,c.ps,true);d.setInt32(8,c.f,true);d.setBigInt64(12,c.id,true);push(b)});
  push(ab.rest);
  var out=new Uint8Array(len),o=0;parts.forEach(function(u){out.set(u,o);o+=u.length});return out;
}
var RMAP={'prefab_male_1p':'p1','prefab_male_3p':'p3','preview':'pv','backwp':'bk'};
function classify(key){
  var fn=key.split('/').pop().toLowerCase();
  if(fn.slice(-7)!=='.prefab')return null;
  fn=fn.slice(0,-7);
  var m=/^(prefab_male_1p|prefab_male_3p|preview|backwp)_(.+?)(_max)?$/.exec(fn);
  if(!m)return null;
  return {role:RMAP[m[1]],label:m[2].replace(/^(pw|sw|mw)_/,''),variant:m[3]?'m':'n'};
}
async function inspectCarrier(u8,onprog){
  var dec=await decodeBundle(u8,onprog);
  var serNode=dec.nodes.filter(function(n){return n.flags&4})[0];
  if(!serNode)throw new Error('Bundle không có serialized file');
  var meta=parseMeta(serNode.data);
  var abObj=null;
  meta.objs.forEach(function(o){if(meta.types[o.tid]&&meta.types[o.tid].cid===142)abObj=o});
  if(!abObj)throw new Error('Không thấy AssetBundle trong file');
  var ab=readAB(serNode.data.subarray(meta.dataOff+abObj.start,meta.dataOff+abObj.start+abObj.size));
  var labels={};
  ab.cont.forEach(function(c){var k=classify(c.key);if(k){(labels[k.label]=labels[k.label]||[]).push(k.role+(k.variant==='m'?'_max':''))}});
  return {dec:dec,serNode:serNode,meta:meta,abObj:abObj,ab:ab,labels:labels};
}
function loadPatch(buf){
  var raw=ff().unzlibSync(buf),dv=dvOf(raw),jl=dv.getUint32(0,true);
  var hdr=JSON.parse(TD.decode(raw.subarray(4,4+jl)));
  var p=4+jl;
  hdr.typesBlob=raw.subarray(p,p+hdr.typesLen);p+=hdr.typesLen;
  hdr.dataBlob=raw.subarray(p,p+hdr.dataLen);p+=hdr.dataLen;
  hdr.resBlob=raw.subarray(p,p+hdr.resLen);
  return hdr;
}
function applyPatch(info,patch,label,notes){
  var meta=info.meta,ser=info.serNode.data,dv=dvOf(ser);
  var resNode=info.dec.nodes.filter(function(n){return /\.resS$/.test(n.name)})[0];
  if(patch.resLen>0&&!resNode)throw new Error('Bundle gốc thiếu file resS');
  var oldData=ser.subarray(meta.dataOff);
  var dataPad=align(oldData.length,8);
  var typeIdx={},newTypes=[];
  meta.types.forEach(function(t,i){if(!(t.hash in typeIdx))typeIdx[t.hash]=i});
  patch.types.forEach(function(t){
    if(t.h in typeIdx)return;
    typeIdx[t.h]=meta.types.length+newTypes.length;newTypes.push(t);
  });
  var extIdx={},newExts=[],nulled=0,missing=[];
  patch.exts.forEach(function(e){
    var found=-1;meta.exts.forEach(function(x,i){if(x.path===e.path)found=i+1});
    if(found>0){extIdx[e.f]=found;return}
    if(/^(library|resources)\//.test(e.path)){extIdx[e.f]=meta.exts.length+newExts.length+1;newExts.push(e)}
    else{extIdx[e.f]=0;nulled++;missing.push(e.path)}
  });
  var resBase=resNode?align(resNode.data.length,16):0;
  var resPath=resNode?('archive:/'+resNode.name.replace(/\.resS$/,'')+'/'+resNode.name):'';
  var newBlobs=[],newEntries=[],cur=dataPad;
  var phBytes=TE.encode(patch.ph);
  patch.objects.forEach(function(o){
    var raw=new Uint8Array(patch.dataBlob.subarray(o.off,o.off+o.len)),d=dvOf(raw);
    o.ext.forEach(function(x){
      var pos=x[0],f=x[1],idx=extIdx[f];
      d.setInt32(pos,idx,true);
      if(idx===0)d.setBigInt64(pos+4,0n,true);
    });
    o.resoff.forEach(function(x){d.setUint32(x[0],resBase+x[1],true)});
    if(o.pathpos>=0){var rp=TE.encode(resPath);if(rp.length!==phBytes.length)throw new Error('Độ dài đường dẫn resS không khớp');raw.set(rp,o.pathpos)}
    cur=align(cur,8);
    newEntries.push({pid:BigInt(o.id),start:cur,size:o.len,tid:typeIdx[o.h]});
    newBlobs.push({at:cur,raw:raw});cur+=o.len;
  });
  var cont=readAB(oldData.subarray(info.abObj.start,info.abObj.start+info.abObj.size));
  var pstart=cont.preload.length;
  patch.objects.forEach(function(o){cont.preload.push({f:0,id:BigInt(o.id)})});
  var plen=patch.objects.length,replaced=0;
  cont.cont.forEach(function(c){
    var k=classify(c.key);if(!k||k.label!==label)return;
    var r=patch.roles[k.role];if(!r)return;
    var tgt=r[k.variant]||r[k.variant==='m'?'n':'m'];if(!tgt)return;
    c.pi=pstart;c.ps=plen;c.f=0;c.id=BigInt(tgt);replaced++;
  });
  if(!replaced)throw new Error('Không thay được prefab nào cho skin gốc "'+label+'"');
  var abNew=writeAB(cont);
  cur=align(cur,8);var abAt=cur;cur+=abNew.length;
  var dataLen=cur;
  var abIdx=meta.objs.indexOf(info.abObj);
  var parts=[],plen2=0;
  function pushU(u){parts.push(u);plen2+=u.length}
  function wI32(v){var b=new Uint8Array(4);new DataView(b.buffer).setInt32(0,v,true);pushU(b)}
  function padTo(a){var pad=align(20+plen2,a)-(20+plen2);if(pad)pushU(new Uint8Array(pad))}
  pushU(ser.subarray(20,meta.types[0]?meta.types[0].start-4:meta.typesEnd));
  var tcPos=meta.types.length?meta.types[0].start-4:null;
  parts=[];plen2=0;
  var pre=ser.slice(20,tcPos);pushU(pre);
  wI32(meta.types.length+newTypes.length);
  pushU(ser.subarray(meta.types[0].start,meta.typesEnd));
  newTypes.forEach(function(t){pushU(patch.typesBlob.subarray(t.off,t.off+t.hl));if(meta.ett){if(!t.tl)throw new Error('Thiếu cây kiểu dữ liệu cho một lớp object (cần bundle gốc khác)');pushU(patch.typesBlob.subarray(t.off+t.hl,t.off+t.hl+t.tl))}});
  var total=meta.objs.length+newEntries.length;
  wI32(total);
  function wObj(pid,start,size,tid){padTo(4);var b=new Uint8Array(20),d=new DataView(b.buffer);d.setBigInt64(0,pid,true);d.setUint32(8,start,true);d.setUint32(12,size,true);d.setInt32(16,tid,true);pushU(b)}
  meta.objs.forEach(function(o,i){if(i===abIdx)wObj(o.pid,abAt,abNew.length,o.tid);else wObj(o.pid,o.start,o.size,o.tid)});
  newEntries.forEach(function(e){wObj(e.pid,e.start,e.size,e.tid)});
  wI32(meta.scripts.length);
  meta.scripts.forEach(function(s){padTo(4);var b=new Uint8Array(12),d=new DataView(b.buffer);d.setInt32(0,s.fi,true);d.setBigInt64(4,s.id,true);pushU(b)});
  wI32(meta.exts.length+newExts.length);
  meta.exts.forEach(function(x){pushU(ser.subarray(x.start,x.end))});
  newExts.forEach(function(e){
    var pb=TE.encode(e.path),b=new Uint8Array(1+16+4+pb.length+1);
    b.set(fromHex(e.guid),1);new DataView(b.buffer).setInt32(17,e.type,true);b.set(pb,21);pushU(b);
  });
  pushU(meta.tail);
  var metaBytes=new Uint8Array(plen2),o2=0;parts.forEach(function(u){metaBytes.set(u,o2);o2+=u.length});
  var metaSize=metaBytes.length;
  var dataOff=align(20+metaSize,16);
  var out=new Uint8Array(dataOff+dataLen);
  var odv=dvOf(out);
  odv.setUint32(0,metaSize);odv.setUint32(4,dataOff+dataLen);odv.setUint32(8,17);odv.setUint32(12,dataOff);
  out.set(ser.subarray(16,20),16);
  out.set(metaBytes,20);
  out.set(oldData,dataOff);
  newBlobs.forEach(function(b){out.set(b.raw,dataOff+b.at)});
  out.set(abNew,dataOff+abAt);
  var res2=null;
  if(resNode){res2=new Uint8Array(resBase+patch.resLen);res2.set(resNode.data,0);res2.set(patch.resBlob,resBase)}
  if(notes){notes.missing=missing;notes.nulled=nulled;notes.newIds=patch.objects.map(function(o){return String(o.id)});notes.replaced=replaced;notes.objects=patch.objects.length}
  return {ser:out,res:res2,resName:resNode?resNode.name:null};
}
function be64(dv,o,v){dv.setBigInt64(o,BigInt(v))}
async function packBundle(info,newSer,newRes,resName,mode,onprog){
  var nodes=info.dec.nodes.map(function(n){
    if(n.flags&4)return {name:n.name,flags:n.flags,data:newSer};
    if(resName&&n.name===resName&&newRes)return {name:n.name,flags:n.flags,data:newRes};
    return {name:n.name,flags:n.flags,data:n.data};
  });
  var total=0;nodes.forEach(function(n){total+=n.data.length});
  var data=new Uint8Array(total),o=0,offs=[];
  nodes.forEach(function(n){offs.push(o);data.set(n.data,o);o+=n.data.length});
  var comp,bflags;
  if(mode==='fast'){comp=data;bflags=0}
  else{comp=await lzmaCompress(data,mode==='small'?5:3,onprog);bflags=1}
  var bi=[];
  function u32(v){var b=new Uint8Array(4);new DataView(b.buffer).setUint32(0,v);bi.push(b)}
  bi.push(new Uint8Array(16));u32(1);
  var bb=new Uint8Array(10),bd=new DataView(bb.buffer);bd.setUint32(0,data.length);bd.setUint32(4,comp.length);bd.setUint16(8,bflags);bi.push(bb);
  u32(nodes.length);
  nodes.forEach(function(n,i){
    var nb=TE.encode(n.name),b=new Uint8Array(20+nb.length+1),d=new DataView(b.buffer);
    d.setBigInt64(0,BigInt(offs[i]));d.setBigInt64(8,BigInt(n.data.length));d.setUint32(16,n.flags);b.set(nb,20);bi.push(b);
  });
  var biLen=0;bi.forEach(function(u){biLen+=u.length});
  var biRaw=new Uint8Array(biLen);o=0;bi.forEach(function(u){biRaw.set(u,o);o+=u.length});
  var biComp,biFlag;
  if(mode==='fast'){biComp=biRaw;biFlag=0x40}
  else{biComp=await lzmaCompress(biRaw,3);biFlag=0x41}
  var h=info.dec.header,orig=info.origBuf;
  var hdr=new Uint8Array(orig.subarray(0,h.hdrEnd)),hd=dvOf(hdr);
  var tot=h.hdrEnd+biComp.length+comp.length;
  var finalLen=Math.max(tot,mode==='fast'?0:info.dec.fileLen);
  hd.setBigInt64(h.hdrEnd-20,BigInt(tot));hd.setUint32(h.hdrEnd-12,biComp.length);hd.setUint32(h.hdrEnd-8,biRaw.length);hd.setUint32(h.hdrEnd-4,biFlag);
  var out=new Uint8Array(finalLen);
  out.set(hdr,0);out.set(biComp,h.hdrEnd);out.set(comp,h.hdrEnd+biComp.length);
  return {out:out,size:tot,origSize:info.dec.fileLen};
}
async function verifyOutput(outBuf,label,notes,onprog){
  var r={ok:true,problems:[]};
  try{
    var inf=await inspectCarrier(outBuf,function(){});
    var ser=inf.serNode.data,meta=inf.meta,dataLen=ser.length-meta.dataOff;
    meta.objs.forEach(function(o){if(o.start+o.size>dataLen){r.ok=false;r.problems.push('Object '+o.pid+' vượt quá dữ liệu')}});
    var ids={};meta.objs.forEach(function(o){ids[String(o.pid)]=1});
    var hit=0,bad=0;
    inf.ab.cont.forEach(function(c){var k=classify(c.key);if(!k||k.label!==label)return;if(notes.newIds.indexOf(String(c.id))>=0){hit++;if(!ids[String(c.id)]){bad++}}});
    r.replaced=hit;
    if(!hit){r.ok=false;r.problems.push('Không có prefab nào trỏ tới skin mod')}
    if(bad){r.ok=false;r.problems.push(bad+' prefab trỏ tới object không tồn tại')}
    var resNode=inf.dec.nodes.filter(function(n){return /\.resS$/.test(n.name)})[0];
    r.hasRes=!!resNode;
  }catch(e){r.ok=false;r.problems.push('Không đọc lại được file vừa tạo: '+(e&&e.message?e.message:e))}
  return r;
}
async function buildMod(carrierBuf,patchBuf,label,mode,onprog,pre){
  var info=pre||await inspectCarrier(carrierBuf,function(p){onprog&&onprog('Giải nén file gốc',p*0.25)});
  info.origBuf=carrierBuf;
  var patch=loadPatch(patchBuf);
  if(patch.ser!==info.meta.ver||patch.unity!==info.meta.unity)throw new Error('Bản bundle gốc ('+info.meta.unity+', v'+info.meta.ver+') không khớp bản dữ liệu skin ('+patch.unity+', v'+patch.ser+')');
  var notes={};
  var r=applyPatch(info,patch,label,notes);
  onprog&&onprog('Ghép skin',0.3);
  var packed=await packBundle(info,r.ser,r.res,r.resName,mode,function(p){onprog&&onprog('Nén file',0.3+p*0.7)});
  onprog&&onprog('Kiểm tra file',0.98);
  notes.verify=await verifyOutput(packed.out,label,notes);
  onprog&&onprog('Xong',1);
  return {file:packed.out,notes:notes,size:packed.size,origSize:packed.origSize};
}
root.GunMod={verifyOutput:verifyOutput,inspectCarrier:inspectCarrier,loadPatch:loadPatch,buildMod:buildMod,classify:classify,parseMeta:parseMeta,decodeBundle:decodeBundle};
if(typeof module!=='undefined')module.exports=root.GunMod;
})(typeof window!=='undefined'?window:globalThis);
