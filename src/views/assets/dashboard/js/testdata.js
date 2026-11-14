let currentPage = 1;
const limit = 10;
let stats = {};
let members = [];
const role = 'member';


async function fetchMembers(page = 1) {
  const search = searchInput.value || "";
  const tier = tierFilter.value || "";

  const res = await fetch(
    `/admin/api/members?page=${page}&limit=${limit}&search=${search}&tier=${tier}&role=${role}`
  );

  if (!res.ok) {
  console.error("API failed:", res.status);
  return;
}

  const data = await res.json();

  members = members = Array.isArray(data.members) ? data.members : [];
  stats = data.stats;

  currentPage = data.page;
  totalPages = data.totalPages;

  renderTable();
  renderPagination();
  renderStats(stats);   
}

document.addEventListener("DOMContentLoaded", () => {
  fetchMembers(1);
});

function renderTable() {
  tbody.innerHTML = members.map(m => `
    <tr>
      <td>
        <div class="fw-semibold">
          ${escapeHtml(m.firstname)} ${escapeHtml(m.lastname)}
        </div>
      </td>
      <td>${escapeHtml(m.email)}</td>
      <td>${escapeHtml(m.phone)}</td>
      <td>
        <span class="badge rounded-pill bg-${
          m.tier === "Gold" ? "warning" :
          m.tier === "Platinum" ? "info" : "secondary"
        } text-dark">
          ${escapeHtml(m.tier)}
        </span>
      </td>
      <td>${escapeHtml(m.joindate)}</td>
      <td class="text-end">
        <button class="btn btn-sm btn-outline-success checkin-btn" data-user="${m.id}">
          <i class="fas fa-check"></i>
        </button>
        <button class="btn btn-sm btn-outline-info"
          onclick="window.location='/admin/member-details/${m.id}'">
          <i class="fas fa-eye"></i>
        </button>
        <button class="btn btn-sm btn-outline-secondary"
          onclick="editMember('${m.id}')">
          <i class="fas fa-edit"></i>
        </button>
        <button class="btn btn-sm btn-outline-danger ms-1"
          onclick="deleteMember('${m.id}')">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    </tr>
  `).join("");

  emptyState.style.display = members.length === 0 ? "block" : "none";
}



// --- Helpers ---
const tbody = document.getElementById("membersTbody");
const emptyState = document.getElementById("emptyState");

document.addEventListener("DOMContentLoaded", () => {
  if (searchInput) searchInput.addEventListener("input", () => fetchMembers(1));
  if (tierFilter) tierFilter.addEventListener("change", () => fetchMembers(1));

  fetchMembers(1); // initial load
});

searchInput.addEventListener("input", () => {
  fetchMembers(1); // reset to page 1
});

tierFilter.addEventListener("change", () => {
  fetchMembers(1);
});

function renderStats(stats) {
  document.getElementById("statTotal").textContent = Number(stats.total);
  document.getElementById("statGold").textContent = Number(stats.gold);
  document.getElementById("statPlatinum").textContent = Number(stats.platinum);
  document.getElementById("statBronze").textContent = Number(stats.bronze);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[m]));
}


function renderPagination() {
  const pagination = document.getElementById("pagination");
  if (!pagination) return;

  pagination.innerHTML = `
    <button ${currentPage <= 1 ? "disabled" : ""} onclick="fetchMembers(${currentPage-1})" class="btn btn-sm"><i class="fa fa-chevron-left"></i></button>
    <span>Page ${currentPage} of ${totalPages}</span>
    <button ${currentPage >= totalPages ? "disabled" : ""} onclick="fetchMembers(${currentPage+1})" class="btn btn-sm"><i class="fa fa-chevron-right"></i></button>
  `;
}

// --- Actions ---
window.deleteMember = async (id) => {
  try {
    const ok = confirm("Delete this member?");
    if (!ok) return;

    const res = await fetch(`/admin/api/members/${id}`, { method: "DELETE",
      credentials: "include"
     });

    if (!res.ok) throw new Error("Failed to delete");

    // update UI
    members = members.filter(m => m.id !== id);
    renderTable();
    showPopup("Member deleted successfully","success");
  } catch (err) {
    console.error(err);
    showPopup("Could not delete member.","error");
  }
};

window.editMember = async (id) => {
  const m = members.find(x => x.id === id);
  if (!m) return;

  const newTier = prompt("Update tier (Bronze / Gold / Platinum):", m.tier);
  if (!newTier) return;

  const allowed = ["Bronze", "Gold", "Platinum"];
  if (!allowed.includes(newTier)) {
    showPopup("Invalid tier.","error");
    return;
  }

  try {
    const res = await fetch(`/admin/api/members/${id}/tier`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ tier: newTier }),
    });

    if (!res.ok) throw new Error("Failed to update tier");

    // update UI locally
    m.tier = newTier;
    renderTable();
    showPopup("Member updated!","success");
  } catch (err) {
    console.error(err);
    showPopup("Could not update tier.","error");
  }
};


// --- Add Member Modal Form ---
addMemberForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  e.stopPropagation();

  if (!addMemberForm.checkValidity()) {
    addMemberForm.classList.add("was-validated");
    return;
  }

  try {
    const payload = {
      firstname: document.getElementById("firstName").value.trim(),
      password: document.getElementById("memberInitialPassword").value,
      lastname: document.getElementById("lastName").value.trim(),
      email: document.getElementById("email").value.trim(),
      phone: document.getElementById("phone").value.trim(),
      tier: document.getElementById("tier").value.trim() || 'Bronze',
      gender: document.getElementById("gender").value.trim(),
      birthdate: document.getElementById("birthDate").value.trim(),
      joindate: document.getElementById("joindate").value,
      ecname : document.getElementById("eName").value.trim(),
      ephone : document.getElementById("eNumber").value.trim(),
      relationship : document.getElementById("eRship").value.trim(),
      notes: document.getElementById("notes").value.trim(),
    };
   

    const res = await fetch("/admin/api/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error("ADD MEMBER failed:", res.status, data);
      alert(data.message || `Could not add member (HTTP ${res.status})`);
      return;
    }

    // Convert DB response -> UI shape and add to top
    const newMember = {
      id: String(data.id),
      firstName: data.firstname,
      lastName: data.lastname,
      email: data.email,
      phone: data.phone,
      tier: data.tier || "Bronze",
      joindate: data.joindate,
    };

    members.unshift(newMember);

    addMemberForm.reset();
    addMemberForm.classList.remove("was-validated");

    const modalEl = document.getElementById("addMemberModal");
    const modal = bootstrap.Modal.getInstance(modalEl);
    modal.hide();

    renderTable();
    showPopup("Member added successfully!","success");
  } catch (err) {
    console.error(err);
    showPopup("Could not add member.", "error");
  }
});

renderTable();


// filters
searchInput.addEventListener("input", renderTable);
tierFilter.addEventListener("change", renderTable);

document.getElementById("year").textContent = new Date().getFullYear();
renderTable();

// check-in member //

document.addEventListener("click", async (e)=>{

  if(!e.target.closest(".checkin-btn")) return;

  const btn = e.target.closest(".checkin-btn");

  const user_id = btn.dataset.user;

  const res = await fetch("/api/attendance/checkin",{
    method:"POST",
    headers:{
      "Content-Type":"application/json"
    },
    credentials: "include",
    body: JSON.stringify({
      user_id
    })
  });

  const data = await res.json();

 if(data.ok){

  showPopup("Member checked in","success");

  btn.disabled = true;
  btn.classList.remove("btn-outline-success");
  btn.classList.add("btn-success");

} else {

  showPopup(data.message || "Already checked in today","warning");

  btn.disabled = true;
  btn.classList.remove("btn-outline-success");
  btn.classList.add("btn-success");
}

});


// check checked-in status
async function loadCheckinStatus(){

  const buttons = document.querySelectorAll(".checkin-btn");

  for(const btn of buttons){

    const user_id = btn.dataset.user;

    console.log(user_id);

    const res = await fetch(`/api/attendance/status/${user_id}`,{
      credentials:"include"
    });

    const data = await res.json();

    if(data.checked_in_today){

      btn.disabled = true;

      btn.classList.remove("btn-outline-success");
      btn.classList.add("btn-success");

    }

  }

}




// ===== Popup Utility ===== //

function showPopup(message, type = "success", duration = 4000) {
  const popup = document.getElementById("popup");
  if (!popup) return;

  // Set message
  popup.textContent = message;

  // Style based on type
  switch (type) {
    case "success":
      popup.style.background = "#28a746bf"; // green
      break;
    case "error":
      popup.style.background = "#dc3545bf"; // red
      break;
    case "info":
      popup.style.background = "#007bffbf"; // blue
      break;
    default:
      popup.style.background = "#77837abf";
  }

  // Show popup
  popup.classList.remove("hidden");

  // Hide after duration
  setTimeout(() => {
    popup.classList.add("hidden");
  }, duration);
}
