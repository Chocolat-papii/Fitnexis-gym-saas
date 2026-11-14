// 

// ========================
//    member insights logic
// ========================

// ✅ Get values correctly
const goalsData = JSON.parse(document.getElementById("allGoals").value);
const trendData = JSON.parse(document.getElementById("allTrends").value);

// Optional: clean counts (Postgres returns strings)
const cleanGoals = goalsData.map(g => ({
  ...g,
  count: Number(g.count)
}));

const cleanTrend = trendData.map(t => ({
  ...t,
  count: Number(t.count),
  month: new Date(t.month).toLocaleString("default", { month: "short" })
}));

// GOALS DONUT
new Chart(document.getElementById("goalsChart"), {
  type: "doughnut",
  data: {
    labels: cleanGoals.map(g => g.primary_goal),
    datasets: [{
      data: cleanGoals.map(g => g.count),
    }]
  }
});

// ATTENDANCE LINE
new Chart(document.getElementById("attendanceChart"), {
  type: "line",
  data: {
    labels: cleanTrend.map(t => t.month),
    datasets: [{
      label: "Monthly Check-ins",
      data: cleanTrend.map(t => t.count),
      fill: true,
      tension: 0.3
    }]
  }
});


//  =================
//    menu funtions
//  =================

// Hambuger function
      const btn = document.getElementById("toggleSidebar");
      const sidebar = document.querySelector(".sidebar");

      btn?.addEventListener("click", () => {
        sidebar.classList.toggle("open");
      });

// Tooltips
      document.querySelectorAll('[data-bs-toggle="tooltip"]')
        .forEach(el => new bootstrap.Tooltip(el));

// =========================
// Smooth Theme Toggle
// =========================

const html = document.documentElement;
const toggleBtn = document.getElementById('themeToggle');
const icon = document.getElementById('themeIcon');

function setTheme(theme) {
  html.setAttribute('data-bs-theme', theme);
  localStorage.setItem('theme', theme);
  icon.className = theme === 'dark' ? 'bi bi-sun' : 'bi bi-moon';
}

// Load theme
setTheme(localStorage.getItem('theme') || 'dark');

toggleBtn.addEventListener('click', () => {
  const current = html.getAttribute('data-bs-theme');
  setTheme(current === 'light' ? 'dark' : 'light');
});

// =========================
// Bell Animation
// =========================
const bellIcon = document.getElementById('bellIcon');

document.getElementById('bellBtn').addEventListener('click', () => {
  bellIcon.classList.remove('bell-animate');
  void bellIcon.offsetWidth;
  bellIcon.classList.add('bell-animate');
});