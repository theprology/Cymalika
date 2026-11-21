window.secureEntry.target((value) => {
  document.getElementById("target").textContent = value;
  document.getElementById("secret").focus();
});
document.getElementById("form").onsubmit = (event) => {
  event.preventDefault();
  const field = document.getElementById("secret"),
    value = field.value;
  field.value = "";
  window.secureEntry.submit(value);
};
document.getElementById("cancel").onclick = () =>
  window.secureEntry.submit(null);
