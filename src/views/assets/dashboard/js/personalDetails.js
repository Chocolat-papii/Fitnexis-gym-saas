var fitnexisLoading = globalThis.FitnexisLoading || { start: () => () => {}, wrap: handler => handler };
// Preview profile image
  document.getElementById("profileImage")?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    document.getElementById("profilePreview").src = url;
  });


  document.getElementById("printDetailsBtn")?.addEventListener("click", () => window.print());


// - - - save personal details information button - - - /
document.getElementById("savePersonalBtn")?.addEventListener("click", fitnexisLoading.wrap(async () => {
    try {
    // If you're uploading a file, use FormData:
    const data = {

        whatsapp_number: document.getElementById("wa-phone")?.value || "",
        alt_phone: document.getElementById("altPhone")?.value || "",
        birthDate: document.getElementById("birthDate")?.value || "",
        gender: document.getElementById("gender")?.value || "",
        street_address: document.getElementById("street")?.value || "",
        city: document.getElementById("city")?.value || "",
        province: document.getElementById("province")?.value || "",
        postal_code: document.getElementById("postalCode")?.value || "",
        notes: document.getElementById("addressNotes")?.value || ""
    };
   


        const res = await fetch("/member/member-personal-details-update", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          credentials: "include",
          body: JSON.stringify(data),
          });

    // Show real response
    // const text = await res.text();
        const result = await res.json();

    console.log("SAVE PROFILE:", res.status, res.statusText, res.url, );


    if (!res.ok || !result.ok) {
      showPopup("Could not save your personal details!", "error");
      return;
    }

    showPopup(result.message || "Personal details saved!", "success");

  } catch (err) {
    console.error("Profile update error", err);        // full error
     //console.error("CODE:", err.code, "MSG:", err.message); pg errors have code/message
    showPopup("Server error updating your personal details", "error");
  }
}));


// - - - Emergency Contact details - - - //

// -- post Emergency Contact details --

document.getElementById("saveEmergencyBtn")?.addEventListener("click", fitnexisLoading.wrap(async () => {
  try {
    const data = {
      ecname: document.getElementById("ecName")?.value?.trim(),
      relationship: document.getElementById("ecRelationship")?.value?.trim(),
      phone: document.getElementById("ecPhone")?.value?.trim(),
      priority: document.getElementById("ecPriority")?.value,
      ems_notes: document.getElementById("ecNotes")?.value?.trim()
    };

    if (!data.ecname || !data.phone) {
       showPopup("Please enter at least a name and phone number.", "error");
      return;
    }

    const res = await fetch("/member/member-emergency-contact-update", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.log("Server response:", errorText);
      showPopup(errorText.message || "Failed to save emergency contact.", "error");
      return;
    }

    renderEmergencyRow(data);

    const modalEl = document.getElementById("addEmergencyModal");
    const modal = bootstrap.Modal.getInstance(modalEl);
    modal?.hide();

    ["ecName", "ecRelationship", "ecPhone", "ecNotes"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });

    document.getElementById("ecPriority").value = "secondary";

    showPopup("Emergency contact successfully updated!", "success");

  } catch (err) {
    console.error("FULL ERROR:", err);
    showPopup("Server error updating your emergency contact details", "error");
  }
}));


function renderEmergencyRow(data) {
  const tbody = document.getElementById("emergencyTable");

  const badgeClass =
    data.priority === "primary"
      ? "text-bg-primary"
      : "text-bg-secondary";

  const row = document.createElement("tr");
  row.setAttribute("data-id", data.id);
  row.setAttribute("data-priority", data.priority);

  row.innerHTML = `
    <td class="fw-semibold text-dark">${data.ecname}</td>
    <td class="small-note">${data.relationship || "—"}</td>
    <td class="small-note">${data.phone}</td>
    <td><span class="badge ${badgeClass}">${data.priority}</span></td>
    <td class="text-end">
      <button class="btn btn-outline-secondary btn-sm edit-btn">Edit</button>
      <button class="btn btn-outline-danger btn-sm delete-btn">Delete</button>
    </td>
  `;

  tbody.appendChild(row);
}


// -- load Emergency Contact  table --

document.addEventListener("DOMContentLoaded", loadEmergencyContacts);

async function loadEmergencyContacts() {
  try {
    const res = await fetch("/member/member-emergency-contacts", {
      credentials: "include",
    });

    if (!res.ok) return;

    const data = await res.json();

    if (!data.contacts) return;

    const tbody = document.getElementById("emergencyTable");
    tbody.innerHTML = "";

    data.contacts.forEach(contact => {
      renderEmergencyRow(contact);
    });

  } catch (err) {
    console.error("LOAD ERROR:", err);
  }
}

//delete contact on emergency table

document.addEventListener("click", fitnexisLoading.wrap(async function (e) {
  if (e.target.classList.contains("delete-btn")) {
    const row = e.target.closest("tr");
    const id = row.getAttribute("data-id");

    if (!confirm("Delete this contact?")) return;

    const res = await fetch(`/member/member-emergency-contact/${id}`, {
      method: "DELETE",
      credentials: "include",
    });

    if (res.ok) {
      row.remove();
        showPopup("Emergency contact successfully deleted!", "success");
    }
  }
}, { selector: ".delete-btn" }));


// edit emeregency table 
document.addEventListener("click", function (e) {
  if (e.target.classList.contains("edit-btn")) {
    const row = e.target.closest("tr");

    document.getElementById("ecName").value =
      row.children[0].textContent;

    document.getElementById("ecRelationship").value =
      row.children[1].textContent === "—" ? "" : row.children[1].textContent;

    document.getElementById("ecPhone").value =
      row.children[2].textContent;

    document.getElementById("ecPriority").value =
      row.getAttribute("data-priority");

    const modal = new bootstrap.Modal(
      document.getElementById("addEmergencyModal")
    );
    modal.show();
  }
});


// ===== Popup Utility =====
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
      popup.style.background = "#28a746bf";
  }

  // Show popup
  popup.classList.remove("hidden");

  // Hide after duration
  setTimeout(() => {
    popup.classList.add("hidden");
  }, duration);
}


// - - health record updates handler
document.addEventListener("DOMContentLoaded", () => {
  const saveBtn = document.querySelector('[data-bs-target="#saveMedInfo"]');

  if (saveBtn) {
    saveBtn.addEventListener("click", fitnexisLoading.wrap(async () => {

      const data = {
        medicalConditions: document.getElementById("medicalConditions").value,
        injuries: document.getElementById("injuries").value,
        healthNotes: document.getElementById("healthNotes").value,
        medication: document.getElementById("medication").value,
        consentShareTrainer: document.getElementById("consentShareTrainer").checked

      };

      try {
        const res = await fetch("/member/member-health-record", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          credentials: "include",
          body: JSON.stringify(data)
        });

        const result = await res.json();

        if (!res.ok || !result.ok) {
          showPopup(result?.message || "Failed to save health info.", "error");
          return;
        }

        showPopup(result.message, "success");

      } catch (err) {
        showPopup("Server error occurred.", "error");
      }
    }));
  }
});


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