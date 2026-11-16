// Destructive actions run only with confirm=yes, which ConfirmAction's dialog sends. The server re-checks it, so a
// stray POST without the dialog does nothing.
export const CONFIRM_ERROR = "Please confirm first.";
export const isConfirmed = (form: FormData) => form.get("confirm") === "yes";
