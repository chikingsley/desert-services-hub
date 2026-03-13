!((n) => {
  function i(n, t) {
    for (var i = window, r = (n || "").split("."); i && r.length; ) {
      i = i[r.shift()];
    }
    return typeof i == "function"
      ? i
      : (t.push(n), Function.constructor.apply(null, t));
  }
  function u(n) {
    return n === "GET" || n === "POST";
  }
  function e(n, t) {
    u(t) || n.setRequestHeader("X-HTTP-Method-Override", t);
  }
  function o(t, i, r) {
    var u;
    r.indexOf("application/x-javascript") === -1 &&
      ((u = (t.getAttribute("data-ajax-mode") || "").toUpperCase()),
      n(t.getAttribute("data-ajax-update")).each((t, r) => {
        switch (u) {
          case "BEFORE":
            n(r).prepend(i);
            break;
          case "AFTER":
            n(r).append(i);
            break;
          case "REPLACE-WITH":
            n(r).replaceWith(i);
            break;
          default:
            n(r).html(i);
        }
      }));
  }
  function f(t, r) {
    var c, l, f, a, s, h;
    ((c = t.getAttribute("data-ajax-confirm")), !c || window.confirm(c)) &&
      ((l = n(t.getAttribute("data-ajax-loading"))),
      (a =
        Number.parseInt(t.getAttribute("data-ajax-loading-duration"), 10) || 0),
      n.extend(r, {
        type: t.getAttribute("data-ajax-method") || void 0,
        url: t.getAttribute("data-ajax-url") || void 0,
        cache:
          (t.getAttribute("data-ajax-cache") || "").toLowerCase() === "true",
        beforeSend(n) {
          var r;
          return (
            e(n, f),
            (r = i(t.getAttribute("data-ajax-begin"), ["xhr"]).apply(
              t,
              arguments
            )),
            r !== !1 && l.show(a),
            r
          );
        },
        complete() {
          l.hide(a);
          i(t.getAttribute("data-ajax-complete"), ["xhr", "status"]).apply(
            t,
            arguments
          );
        },
        success(n, r, u) {
          o(t, n, u.getResponseHeader("Content-Type") || "text/html");
          i(t.getAttribute("data-ajax-success"), [
            "data",
            "status",
            "xhr",
          ]).apply(t, arguments);
        },
        error() {
          i(t.getAttribute("data-ajax-failure"), [
            "xhr",
            "status",
            "error",
          ]).apply(t, arguments);
        },
      }),
      r.data.push({ name: "X-Requested-With", value: "XMLHttpRequest" }),
      (f = r.type.toUpperCase()),
      u(f) ||
        ((r.type = "POST"),
        r.data.push({ name: "X-HTTP-Method-Override", value: f })),
      (s = n(t)),
      s.is("form") &&
        s.attr("enctype") == "multipart/form-data" &&
        ((h = new FormData()),
        n.each(r.data, (n, t) => {
          h.append(t.name, t.value);
        }),
        n("input[type=file]", s).each(function () {
          n.each(this.files, (n, i) => {
            h.append(this.name, i);
          });
        }),
        n.extend(r, { processData: !1, contentType: !1, data: h })),
      n.ajax(r));
  }
  function s(t) {
    var i = n(t).data(h);
    return !(i && i.validate) || i.validate();
  }
  var t = "unobtrusiveAjaxClick",
    r = "unobtrusiveAjaxClickTarget",
    h = "unobtrusiveValidation";
  n(document).on("click", "a[data-ajax=true]", function (n) {
    n.preventDefault();
    f(this, { url: this.href, type: "GET", data: [] });
  });
  n(document).on("click", "form[data-ajax=true] input[type=image]", (i) => {
    var r = i.target.name,
      u = n(i.target),
      f = n(u.parents("form")[0]),
      e = u.offset();
    f.data(t, [
      { name: r + ".x", value: Math.round(i.pageX - e.left) },
      { name: r + ".y", value: Math.round(i.pageY - e.top) },
    ]);
    setTimeout(() => {
      f.removeData(t);
    }, 0);
  });
  n(document).on("click", "form[data-ajax=true] :submit", (i) => {
    var f = i.currentTarget.name,
      e = n(i.target),
      u = n(e.parents("form")[0]);
    u.data(t, f ? [{ name: f, value: i.currentTarget.value }] : []);
    u.data(r, e);
    setTimeout(() => {
      u.removeData(t);
      u.removeData(r);
    }, 0);
  });
  n(document).on("submit", "form[data-ajax=true]", function (i) {
    var e = n(this).data(t) || [],
      u = n(this).data(r),
      o = u && (u.hasClass("cancel") || void 0 !== u.attr("formnovalidate"));
    i.preventDefault();
    (o || s(this)) &&
      f(this, {
        url: this.action,
        type: this.method || "GET",
        data: e.concat(n(this).serializeArray()),
      });
  });
})(jQuery);
var Planning = Planning || {};
Planning.DmSearch = ((n, t) => {
  var i,
    o = () => {
      var t = Number.parseInt(n("#currentPage").val());
      n("#currentPage").val(t + 1);
      t > 0 ? n("#topBtn").show() : n("#topBtn").hide();
    },
    s = () => {
      var t = Number.parseInt(n("#currentPage").val()),
        i = Number.parseInt(n("#recordCount").val()) || 0;
      n.ajax({
        type: "POST",
        url: ApplicationOptions.BaseUrl + "/EDM/CheckForMoreDocuments",
        data: { currentPageNumber: t, recordCount: i },
        dataType: "json",
        success(t) {
          t ? n("#moreBtn").show() : n("#moreBtn").hide();
        },
      });
    },
    h = () => {
      n("#search-progress").removeClass("hidden");
      n("#loading").show();
    },
    c = () => {
      n("#search-progress").addClass("hidden");
      n("#loading").hide();
    },
    u = () => {
      n("#currentPage").val(0);
      n("#recordCount").val(0);
      n("#searchResults").empty();
      n("#topBtn").hide();
      n("#moreBtn").hide();
      n("#StreetNum").val("");
      n("#StreetName").val("");
      n("#StreetType").val("");
      n("#SuffixType").val("");
      n("#SuffixNum").val("");
      n("#LotNum").val("");
      n("#CaseNum").val("");
      n("#PlanNum").val("");
      n("#PermitNum").val("");
      n("#CivilNum").val("");
      n("#APNNum").val("");
      n("#FullText").val("");
      n("[name=DocType]").prop("checked", !1);
    },
    f = () => {
      var t = n("input[name=DocType]:checked")
        .map((t, i) => n(i).val())
        .get()
        .join(",");
      i = {
        PageNumber: 0,
        StreetNum: n("#StreetNum").val(),
        StreetDir: n("#StreetDir").val(),
        StreetName: n("#StreetName").val(),
        StreetType: n("#StreetType").val(),
        SuffixType: n("#SuffixType").val(),
        SuffixNum: n("#SuffixNum").val(),
        LotNum: n("#LotNum").val(),
        CaseNum: n("#CaseNum").val(),
        PlanNum: n("#PlanNum").val(),
        PermitNum: n("#PermitNum").val(),
        CivilNum: n("#CivilNum").val(),
        APNNum: n("#APNNum").val(),
        FullText: n("#FullText").val(),
        DocType: t,
        SortProperty: Planning.SortModal.SortProperty(),
        SortOrder: Planning.SortModal.SortOrder(),
      };
    },
    e = () => {
      (i === null || typeof i == "undefined") && f();
      var r = Number.parseInt(n("#currentPage").val());
      i.PageNumber = r;
      n("#moreBtn").hide();
      n.ajax({
        type: "POST",
        url: ApplicationOptions.BaseUrl + "/EDM/LoadMoreDocuments",
        data: JSON.stringify(i),
        contentType: "application/json; charset=utf-8",
        dataType: "html",
        success(i) {
          n("#searchResults").append(i);
          r === 0 && t.helpers.scrollTo("#search-progress");
          s();
          o();
        },
        error(n, t, i) {
          alert("error " + i);
        },
        beforeSend() {
          h();
        },
        complete() {
          c();
        },
      });
    },
    r = () => {
      n("#searchResults").empty();
      n("#currentPage").val(0);
      f();
      e();
    },
    a = () => {
      document.referrer !== "" &&
        document.referrer.indexOf(window.location.hostname) === -1 &&
        u();
    },
    l = () => {
      n(document).ready((n) => {
        n(document).on("click", ".clickable-div", function () {
          window.open(n(this).data("href"), "_blank");
        });
        n(document).on("click", "#moreBtn", (n) => {
          n.preventDefault();
          e();
        });
        n(
          "#StreetNum,#StreetName,#StreetType,#SuffixType,#SuffixNum,#LotNum,#CaseNum,#PlanNum,#PermitNum,#CivilNum,#APNNum,#FullText"
        ).on("keydown", (n) => {
          n.keyCode === 13 && (n.preventDefault(), r());
        });
        n(document).on("click", "#performSearch", () => {
          Planning.SortModal.PrepareSearch();
          n("#moreBtn").hide();
          r();
        });
      });
    };
  return { Init: l, SearchDocuments: r, ResetSearch: u };
})(window.jQuery, window.eServices);
