"use strict";
const el = (id) => document.getElementById(id);
let credential = "";
let flow = "";
let registering = false;

async function api(action, body) {
  const headers = { "X-Material-Request": "panel" };
  if (credential) headers["X-Material-Authorization"] = "Bearer " + credential;
  if (body) headers["Content-Type"] = "application/json";
  const response = await fetch("api/" + action, {
    method: body ? "POST" : "GET", headers,
    body: body ? JSON.stringify(body) : undefined, cache: "no-store",
  });
  if (!response.ok) {
    const error = new Error("Request returned HTTP " + response.status);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

async function setup() {
  el("retry").hidden = true;
  try {
    let steps = [];
    try {
      steps = await api("setup");
    } catch (error) {
      if (error.status !== 404) throw error;
    }
    registering = steps.some((s) => s.step === "user" && !s.done);
    el("nameField").hidden = !registering;
    el("name").required = registering;
    el("submit").textContent = registering ? "Create owner" : "Sign in";
    el("password").autocomplete = registering ? "new-password" : "current-password";
    el("status").textContent = registering
      ? "Create the first owner of this separate instance."
      : "Sign in with an account from this separate instance.";
    el("login").hidden = false;
  } catch (error) {
    el("status").textContent = error.message;
    el("retry").hidden = false;
  }
}

async function refresh() {
  try {
    const states = await api("states");
    el("states").replaceChildren(...states.map((s) => {
      const item = document.createElement("li");
      item.textContent = s.entity_id + " · " + s.state;
      return item;
    }));
    el("status").textContent = states.length + " entity states loaded.";
  } catch (error) {
    el("status").textContent = error.message;
  }
}

async function enter(authCode) {
  const data = await api("exchange", { code: authCode });
  credential = data.access_token;
  el("login").reset();
  el("verify").reset();
  el("login").hidden = el("verify").hidden = true;
  el("entities").hidden = false;
  await refresh();
}

async function handle(result) {
  if (result.type === "create_entry") return enter(result.result);
  if (result.type === "form" && result.data_schema?.some((field) => field.name === "code")) {
    flow = result.flow_id;
    el("login").hidden = true;
    el("verify").hidden = false;
    el("status").textContent = "Enter the verification code for this account.";
    el("code").focus();
    return;
  }
  throw new Error("Sign-in was not accepted. Check the account and authentication method.");
}

el("login").onsubmit = async (event) => {
  event.preventDefault();
  el("submit").disabled = true;
  const username = el("username").value;
  const password = el("password").value;
  el("password").value = "";
  try {
    if (registering) {
      const data = await api("register", { name: el("name").value, username, password });
      await enter(data.auth_code);
    } else {
      const result = await api("login", {});
      await handle(await api("authenticate", { flow: result.flow_id, username, password }));
    }
  } catch (error) {
    el("status").textContent = error.message;
    el("retry").hidden = false;
  } finally {
    el("submit").disabled = false;
  }
};
el("verify").onsubmit = async (event) => {
  event.preventDefault();
  try {
    await handle(await api("authenticate", { flow, code: el("code").value }));
  } catch (error) {
    el("status").textContent = error.message;
  }
};
el("logout").onclick = () => location.reload();
el("refresh").onclick = refresh;
el("retry").onclick = setup;
setup();
