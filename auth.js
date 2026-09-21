const form = document.getElementById("authForm");
const tabs = document.querySelectorAll(".auth-tab");
const nameField = document.getElementById("nameField");
const title = document.getElementById("authTitle");
const subtitle = document.getElementById("authSubtitle");
const submit = document.querySelector(".auth-submit");
const message = document.getElementById("authMessage");
let mode = "login";

tabs.forEach((tab) => tab.addEventListener("click", () => {
    mode = tab.dataset.mode;
    tabs.forEach((item) => item.classList.toggle("active", item === tab));
    const registering = mode === "register";
    nameField.classList.toggle("hidden", !registering);
    nameField.querySelector("input").required = registering;
    title.textContent = registering ? "Créer votre espace" : "Bon retour";
    subtitle.textContent = registering ? "Créez votre compte FamilyDrive gratuitement." : "Connectez-vous à votre espace FamilyDrive.";
    submit.textContent = registering ? "Créer mon compte" : "Se connecter";
}));

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    message.textContent = "";
    submit.disabled = true;
    const body = Object.fromEntries(new FormData(form));
    try {
        const response = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Une erreur est survenue.");
        window.location.assign("/");
    } catch (error) {
        message.textContent = error.message;
        submit.disabled = false;
    }
});
