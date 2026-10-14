/* VennLMAO local mode. This build runs without the original Supabase account/points backend. */
(() => {
  const heading = () => document.getElementById('venn-mod-turns');
  if (heading()) heading().textContent = 'Bản chạy cục bộ · không cần đăng nhập';
  window.vennCheckExport = async count => ({ id: 'local-' + crypto.randomUUID(), user: 'local', count: Number(count) || 1, local: true });
  window.vennChargeExport = async ticket => {
    if (!ticket || !ticket.local) throw new Error('Phiên xuất cục bộ không hợp lệ.');
    if (heading()) heading().textContent = 'Bản chạy cục bộ · không trừ điểm';
    return true;
  };
})();
