  // Preview profile image
  document.getElementById("profileImage")?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    document.getElementById("profilePreview").src = url;
  });

  // Toggle password visibility buttons
  document.querySelectorAll("[data-toggle-pass]")?.forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-toggle-pass");
      const input = document.getElementById(id);
      if (!input) return;
      input.type = input.type === "password" ? "text" : "password";
    });
  }); 

  // Save profile hook
  document.getElementById("saveProfileBtn")?.addEventListener("click", async () => {
  try {
    // If you're uploading a file, use FormData:
    const fd = new FormData();

    fd.append("display_name", document.getElementById("displayName")?.value || "");
    fd.append("bio", document.getElementById("bio")?.value || "");

    if (document.getElementById("notifyEmail")?.checked) fd.append("mail_note", "on");
    if (document.getElementById("notifySms")?.checked) fd.append("sms_note", "on");
    if (document.getElementById("notifyWhatsapp")?.checked) fd.append("wa_note", "on");

    const fileInput = document.getElementById("profileImage");
    if (fileInput?.files?.[0]) fd.append("profile_picture", fileInput.files[0]); // IMPORTANT name

    const res = await fetch("/member/member-profile-update", {
      method: "POST",
      credentials: "include",
      body: fd,
    });

    const result = await res.json();

    if (!res.ok) {
      showPopup(result.message || 'Could not save profile. Please try again.', "info");
      return;
    }

    if (result.profile_picture) {
      document.getElementById('profilePreview').src = result.profile_picture;
    }
    showPopup("Profile saved successfully", "success")
  } catch (err) {
    console.error(err);
    showPopup("Could not save profile. Server error","error");
  }
});



  // Password actions
 document.addEventListener("DOMContentLoaded", () => {
  const ids = ["currentPassword", "newPassword", "confirmPassword"];

  const clearPasswords = () => {
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;

      el.value = "";
      // helps UI update / some libraries / autofill edge cases
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
  };

  document.getElementById("clearPasswordFieldsBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    clearPasswords();
  });

  document.getElementById("updatePasswordBtn")?.addEventListener("click", async (e) => {
    e.preventDefault();

    const currentPassword = document.getElementById("currentPassword")?.value.trim();
    const newPassword = document.getElementById("newPassword")?.value.trim();
    const confirmPassword = document.getElementById("confirmPassword")?.value.trim();

    if (!currentPassword || !newPassword || !confirmPassword) {
      alert("Please fill in all password fields.");
      return;
    }
    if (newPassword.length < 8) {
      alert("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      alert("New password and confirm password do not match.");
      return;
    }

    try {
      const res = await fetch("/member/member-password-update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        showPopup(data.message || `Could not update password ❌ status ${res.status}`, "info");
        return;
      }

      clearPasswords();
      showPopup("Password updated successfully","success");
    } catch (err) {
      console.error(err);
      showPopup("Server error. Could not update password", "error");
    }
  });
});


  document.getElementById("logoutAllBtn")?.addEventListener("click", () => {
    alert("All devices logged out (hook API next).");
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
