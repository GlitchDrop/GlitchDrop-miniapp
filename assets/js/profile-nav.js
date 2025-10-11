(function attachProfileNav(){
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachProfileNav);
    return;
  }
  const tabs = Array.from(document.querySelectorAll('.tab'));
  const profileTab = tabs.find(tab => /(^|\s)Профиль(\s|$)/i.test(tab.textContent.trim()));
  if (!profileTab) return;

  profileTab.addEventListener('click', (e) => {
    e.preventDefault();
    window.location.href = 'profile.html';
  }, { passive: true });
})();
