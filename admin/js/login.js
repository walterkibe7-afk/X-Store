document.getElementById('f').onsubmit = async e => {
  e.preventDefault();
  const err = document.getElementById('err');
  err.style.display = 'none';
  const email = document.getElementById('e').value.trim();
  const password = document.getElementById('p').value;
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) {
      err.textContent = data.error || 'Login failed';
      err.style.display = 'block';
      return;
    }
    location.href = 'index.html';
  } catch (e) {
    err.textContent = 'Network error. Please try again.';
    err.style.display = 'block';
  }
};
