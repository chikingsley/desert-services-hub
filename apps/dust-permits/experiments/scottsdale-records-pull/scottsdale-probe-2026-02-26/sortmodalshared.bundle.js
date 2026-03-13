var Planning = Planning || {};
Planning.SortModal = ((n) => {
  var r = { Ascending: 1, Descending: 0 },
    u = "",
    i = u,
    f = r.Descending,
    t = f,
    e = !1,
    o = () => i,
    s = () => t,
    h = () => {
      i = n("#sortProperty").prop("value");
      t = n("#sortOrder").prop("value");
      u = i;
      f = t;
      n("#sortModal").modal("hide");
    },
    c = () => {
      n(document).on("click", ".sort-option", function () {
        n(this).addClass("active").siblings().removeClass("active");
        i = n(this).prop("value");
        n("#sortProperty").prop("value", i);
      });
      n(document).on("click", "#sortOrder", function () {
        t = t === r.Descending ? r.Ascending : r.Descending;
        n(this).prop("value", t);
        n("#sortImage").toggleClass(
          "glyphicon-sort-by-attributes-alt glyphicon-sort-by-attributes"
        );
        n("#sortText").html(t === r.Descending ? " Descending" : " Ascending");
      });
      n(document).on("hidden.bs.modal", ".modal", () => {
        i = u;
        n("#sortProperty").prop("value", i);
        n(".sort-option").removeClass("active");
        n('.sort-option[value="' + i + '"]').addClass("active");
        t = f;
        n("#sortOrder").prop("value", t);
        n("#sortImage").removeClass();
        n("#sortImage").addClass(
          t === r.Descending
            ? "glyphicon glyphicon-sort-by-attributes-alt"
            : "glyphicon glyphicon-sort-by-attributes"
        );
        n("#sortText").html(t === r.Descending ? " Descending" : " Ascending");
      });
      n(document).on("show.bs.modal", ".modal", () => {
        e ||
          ((u = n("#sortProperty").prop("value")),
          (i = u),
          (f = n("#sortOrder").prop("value")),
          (t = f),
          (e = !0));
      });
    };
  return { Init: c, PrepareSearch: h, SortProperty: o, SortOrder: s };
})(window.jQuery, window.eServices);
