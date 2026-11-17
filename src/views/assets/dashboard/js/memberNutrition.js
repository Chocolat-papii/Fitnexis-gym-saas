var fitnexisLoading = globalThis.FitnexisLoading || { start: () => () => {}, wrap: handler => handler };
  // Close sidebar when a link is clicked (mobile)
      document.querySelectorAll(".sidebar a").forEach(a => {
        a.addEventListener("click", () => {
          if (window.innerWidth < 992) closeSidebar();
        });
      });
  
  const sidebar = document.querySelector(".sidebar");
      const toggle = document.getElementById("toggleSidebar");
      const backdrop = document.getElementById("backdrop");

      function openSidebar() {
        sidebar.classList.add("open");
        backdrop.classList.add("show");
      }

      function closeSidebar() {
        sidebar.classList.remove("open");
        backdrop.classList.remove("show");
      }

      toggle?.addEventListener("click", openSidebar);
      backdrop?.addEventListener("click", closeSidebar);



  
  //  - - - member physique hamdler

  document.getElementById("saveNutritionBtn").addEventListener("click", fitnexisLoading.wrap(async () => {

  const currentActivities = Array.from(
    document.querySelectorAll('.btn-check:checked')
  )
  .filter(cb => cb.closest(".col-md-6")?.querySelector("label")?.innerText.includes("Current Activities"))
  .map(cb => cb.value);

  const trainingStyles = Array.from(
    document.querySelectorAll('.btn-check:checked')
  )
  .filter(cb => cb.closest(".col-md-6")?.querySelector("label")?.innerText.includes("Preferred Training Styles"))
  .map(cb => cb.value);

  const payload = {
    primary_goal: document.getElementById("goalPrimary").value || null,
    current_weight: document.getElementById("caloriesTarget1").value || null,
    target_weight: document.getElementById("caloriesTarget").value || null,
    height: document.getElementById("height").value || null,
    waist: document.getElementById("waist").value || null,
    protein: document.getElementById("macroProtein").value || null,
    carbs: document.getElementById("macroCarbs").value || null,
    fats: document.getElementById("macroFats").value || null,
    notes: document.getElementById("nutritionNotes").value || null,
    occupation: document.getElementById("occupation").value || null,
    stress_level: document.getElementById("stressLevel").value || null,
    sleep_hours: document.getElementById("sleepHours").value || null,
    activity_level: document.getElementById("activityLevel").value || null,
    exercise_frequency: document.getElementById("exerciseFrequency").value || null,
    sitting_hours: document.getElementById("sittingHours").value || null,
    current_activities: currentActivities,
    training_styles: trainingStyles
  };
try {
  const response = await fetch("/member/physiqueLifestyle", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    credentials: "include"
  });

  const result = await response.json();

   console.log(result)
    if (result.success) {
      showPopup(result.message, "success");
    } else {
      showPopup(result.message, "error");
    }
  } catch (err) {
    showPopup("Could not save these details. Please try again.", "error");
  }

}));


  // - - - Dietary info Handler- - - //

  document.getElementById("saveDietBtn").addEventListener("click", fitnexisLoading.wrap(async () => {
  const payload = {
    diet_type: document.getElementById("dietType").value || null,
    meals_per_day: document.getElementById("mealsPerDay").value || null,
    water_per_day: document.getElementById("waterPerDay").value || null,
    foods_avoid: document.getElementById("foodsAvoid").value || null,
    supplements: document.getElementById("supplements").value || null,
    hydration_goal: document.getElementById("hydrationGoal").value || null,
    allergies: document.getElementById("allergies").value || null,
    restrictions: document.getElementById("restrictions").value || null,
    preferred_checkin_day: document.getElementById("checkInDay").value || null,
  };

  try {
    const res = await fetch("/member/dietary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
        credentials: "include"
    });

    const data = await res.json();


    console.log(data)
    if (data.success) {
      showPopup(data.message, "success");
    } else {
      showPopup(data.message, "error");
    }

  } catch (err) {
    showPopup("Could not save these details. Please try again.", "error");
  }
}));
  



//  - - - tabulate data - - - //

  document.getElementById("saveCheckInBtn")?.addEventListener("click", () => {
    // TODO: append to table + send to backend
    alert("Check-in saved (hook API next).");
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
