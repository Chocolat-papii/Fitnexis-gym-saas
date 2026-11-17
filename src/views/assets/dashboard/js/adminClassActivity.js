var fitnexisLoading = globalThis.FitnexisLoading || { start: () => () => {}, wrap: handler => handler };

// - - - class action activities - - - //


document.getElementById("saveClassBtn").addEventListener("click", fitnexisLoading.wrap(async () => {

    try {
    const id = document.getElementById("classId").value;

    const payload = {
        name: document.getElementById("name").value,
        description: document.getElementById("description").value,
        default_duration_minutes: document.getElementById("default_duration_minutes").value
    };

    const url = id 
        ? `/admin/api/class-types/${id}`
        : `/admin/api/class-types`;

    const method = id ? "PUT" : "POST";

    const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include"
    });

        const result = await response.json();


    if (response.ok) {
            showPopup(result.message || "Class saved successfully", "success", 3000);
            location.reload();
        } else {
            showPopup(result.message || "Class creation failed", "error", 3000);
            return;
        }
            
    }  catch (err) {
    console.error("Profile update error", err);    // full error
     console.error("CODE:", err.code, "MSG:", err.message); //pg errors have code/message
    showPopup("Server error saving class", "error", 3000);
    }
}));

// - - edit button - - 

document.addEventListener("click", function (e) {

  if (e.target.closest(".edit-class")) {
    const btn = e.target.closest(".edit-class");

    document.getElementById("classId").value = btn.dataset.id;
    document.getElementById("name").value = btn.dataset.name;
    document.getElementById("description").value = btn.dataset.description;
    document.getElementById("default_duration_minutes").value = btn.dataset.duration;
  }

});

// - - delete button - -

document.addEventListener("click", fitnexisLoading.wrap(async function (e) {

  if (e.target.closest(".delete-class")) {
    const id = e.target.closest(".delete-class").dataset.id;

    if (!confirm("Are you sure you want to delete this class?")) return;

    const response = await fetch(`/admin/api/class-types/${id}`, {
      method: "DELETE",
      credentials: "include"
    });

    if (response.ok) {
      showPopup("Class deleted successfully", "success", 3000);
      location.reload();
    } else {
      showPopup("Failed to delete class", "error", 3000);
    }
  }

}, { selector: ".delete-class" }));

// reset form on create new class 
document.querySelector('[data-bs-target="#classesModal"]').addEventListener("click", () => {
  document.getElementById("classForm").reset();
  document.getElementById("classId").value = "";
});
    
// ===== Popup message Utility ===== //

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
