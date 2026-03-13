var Planning = Planning || {};
Planning.HelpModal = ((n) => (
  (init = () => {
    n(document).on("click", ".showHelp", (t) => {
      var i = n(t.currentTarget).data();
      n("#" + i.id).toggleClass("hidden show");
      n("#contextHelpModal").modal("show");
    });
    n(document).on("hidden.bs.modal", ".modal", () => {
      n("#context_help").children().removeClass().addClass("hidden");
    });
  }),
  { Init: init }
))(window.jQuery, window.eServices);
