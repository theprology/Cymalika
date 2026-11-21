const notice =
  "CyMalika recovered after its interface stopped. Pending work was cancelled; app access was disconnected. Saved conversations are in Chats. Reopen your project or reconnect an app before starting a new task.";
function resetAfterRendererFailure(cancel, workspace, computer) {
  cancel();
  workspace.fullComputer = false;
  workspace.grants = new Set(["files", "edits", "commands", "git"]);
  workspace.origins = new Set();
  computer.apps.clear();
  return notice;
}
module.exports = { resetAfterRendererFailure };
