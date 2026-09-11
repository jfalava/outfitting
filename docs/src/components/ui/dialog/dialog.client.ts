import { lockScroll, mount, unlockScroll } from "@cloudflare/nimbus-docs/client";

function onDialogClose() {
  unlockScroll();
}

mount("[data-dialog]", (root) => {
  if (!(root instanceof HTMLDialogElement)) {
    return () => undefined;
  }
  const dialog = root;

  const sync = () => (dialog.open ? lockScroll() : unlockScroll());
  const observer = new MutationObserver(sync);
  observer.observe(dialog, { attributes: true, attributeFilter: ["open"] });

  const onBackdrop = (e: MouseEvent) => {
    if (e.target === dialog) {
      dialog.close();
    }
  };
  dialog.addEventListener("close", onDialogClose);
  dialog.addEventListener("click", onBackdrop);

  return () => {
    observer.disconnect();
    dialog.removeEventListener("close", onDialogClose);
    dialog.removeEventListener("click", onBackdrop);
    // A swap while open never fires `close`; balance the scroll lock.
    if (dialog.open) {
      unlockScroll();
    }
  };
});
