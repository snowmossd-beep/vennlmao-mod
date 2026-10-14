(() => {
const toggle=document.getElementById('venn-menu-toggle'),menu=document.getElementById('venn-menu');
function setOpen(open){menu.hidden=!open;toggle.setAttribute('aria-expanded',String(open));}
toggle.addEventListener('click',()=>setOpen(menu.hidden));
document.addEventListener('click',event=>{if(!event.target.closest('.venn-nav'))setOpen(false);});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!menu.hidden){setOpen(false);toggle.focus();}});
})();
