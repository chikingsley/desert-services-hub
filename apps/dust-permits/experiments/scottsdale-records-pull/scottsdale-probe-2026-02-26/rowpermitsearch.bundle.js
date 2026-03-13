var Planning = Planning || {};
Planning.ROWPermitSearch = ((n, t) => {
  var i,
    f = () => {
      var t = Number.parseInt(n("#currentPage").val());
      n("#currentPage").val(t + 1);
      t > 0 ? n("#topBtn").show() : n("#topBtn").hide();
    },
    e = () => {
      var t = Number.parseInt(n("#currentPage").val()),
        i = Number.parseInt(n("#recordCount").val()) || 0;
      n.ajax({
        type: "POST",
        url: ApplicationOptions.BaseUrl + "/ROWPermit/CheckForMoreROWPermits",
        data: { currentPageNumber: t, recordCount: i },
        dataType: "json",
        success(t) {
          t ? n("#moreBtn").show() : n("#moreBtn").hide();
        },
      });
    },
    c = () => {
      n("#search-progress").removeClass("hidden");
    },
    r = () => {
      n("#search-progress").addClass("hidden");
    },
    o = () => {
      i = {
        PageNumber: 0,
        PermitNumber: n("#permitNumber").val(),
        ProjectName: n("#projectName").val(),
        Location: n("#location").val(),
        OwnerName: n("#ownerName").val(),
        APN: n("#apn").val(),
        WorkOrder: n("#workOrder").val(),
        SortProperty: Planning.SortModal.SortProperty(),
        SortOrder: Planning.SortModal.SortOrder(),
      };
    },
    s = () => {
      (i === null || typeof i == "undefined") && o();
      var u = Number.parseInt(n("#currentPage").val());
      i.PageNumber = u;
      n("#moreBtn").hide();
      n.ajax({
        type: "POST",
        url: ApplicationOptions.BaseUrl + "/ROWPermit/LoadMoreROWPermits",
        data: JSON.stringify(i),
        contentType: "application/json; charset=utf-8",
        dataType: "html",
        success(o) {
          if (
            (n("#searchResults").append(o),
            u === 0 && t.helpers.scrollTo("#search-progress"),
            e(),
            f(),
            n("#moreBtnImg").hide(),
            r(),
            Modernizr.sessionstorage)
          ) {
            var s = window.sessionStorage,
              h = JSON.stringify(n("#searchResults").html()),
              c = Number.parseInt(n("#recordCount").val()) || 0;
            c > 0
              ? s.setItem("rowPermitSearchResults", h)
              : s.setItem("rowPermitSearchResults", JSON.stringify(""));
            s.setItem(
              "rowPermitSearchResultsPage",
              Number.parseInt(n("#currentPage").val())
            );
            s.setItem("rowPermitSearchData", JSON.stringify(i));
          }
        },
        error(t, i, u) {
          r();
          n("#moreBtnImg").hide();
          alert("error " + u);
        },
      });
    },
    u = () => {
      c();
      n("#searchResults").empty();
      n("#currentPage").val(0);
      o();
      s();
    },
    h = () => {
      if (
        (n("#currentPage").val(0),
        n("#recordCount").val(0),
        n("#permitNumber").val(""),
        n("#searchResults").empty(),
        n("#projectName").val(""),
        n("#location").val(""),
        n("#ownerName").val(""),
        n("#workOrder").val(""),
        n("#apn").val(""),
        n("#topBtn").hide(),
        n("#moreBtn").hide(),
        r(),
        Modernizr.sessionstorage)
      ) {
        var t = window.sessionStorage;
        t.removeItem("rowPermitSearchResults");
        t.removeItem("rowPermitSearchResultsPage");
        t.removeItem("rowPermitSearchData");
      }
    },
    l = () => {
      var t = "#changeSearchCriteriaState",
        i = n("#AdditionalSearchCriteria").css("display") === "none";
      i
        ? (n(t.toString()).removeClass("glyphicon-collapse-down"),
          n(t.toString()).addClass("glyphicon-collapse-up"),
          n("#AdditionalSearchCriteria").show(),
          n("#searchOptions").attr("title", "Click to hide options"))
        : (n(t.toString()).removeClass("glyphicon-collapse-up"),
          n(t.toString()).addClass("glyphicon-collapse-down"),
          n("#AdditionalSearchCriteria").hide(),
          n("#searchOptions").attr("title", "Click to show options"));
    },
    a = () => {
      var t = "#changeSearchCriteriaState",
        i = n("#AdditionalSearchCriteria").css("display") === "none";
      i
        ? (n(t.toString()).removeClass("glyphicon-collapse-up"),
          n(t.toString()).addClass("glyphicon-collapse-down"))
        : (n(t.toString()).removeClass("glyphicon-collapse-down"),
          n(t.toString()).addClass("glyphicon-collapse-up"));
    },
    v = () => {
      document.referrer !== "" &&
        document.referrer.indexOf(window.location.hostname) === -1 &&
        h();
    },
    y = () => {
      var t, r, o, h;
      n("#searchOptions").attr("title", "Click to hide options");
      n(document).on("click", ".clickable-div", function () {
        window.document.location = n(this).data("href");
      });
      n(document).on("click", "#moreBtn", (t) => {
        t.preventDefault();
        n("#moreBtnImg").show();
        s();
      });
      n("#permitNumber,#projectName,#location,#ownerName,#apn,#workOrder").on(
        "keydown",
        (n) => {
          n.keyCode === 13 && (n.preventDefault(), u());
        }
      );
      localStorage.rowPermitDetailsScroll = "";
      n(document).on("click", "#performSearch", () => {
        Planning.SortModal.PrepareSearch();
        n("#moreBtn").hide();
        u();
      });
      Modernizr.sessionstorage &&
        ((t = window.sessionStorage),
        (r = JSON.parse(t.getItem("rowPermitSearchResults"))),
        r &&
          (n("#searchResults").html(r),
          (o = JSON.parse(t.getItem("rowPermitSearchResultsPage"))),
          n("#currentPage").val(o - 1),
          (i = JSON.parse(t.getItem("rowPermitSearchData"))),
          n("#permitNumber").val(i.PermitNumber),
          n("#projectName").val(i.ProjectName),
          n("#location").val(i.Location),
          n("#ownerName").val(i.OwnerName),
          n("#apn").val(i.APN),
          n("#workOrder").val(i.WorkOrder)),
        e(),
        f(),
        n("#moreBtnImg").hide());
      h = n("#AdditionalSearchCriteria").css("display") === "none";
      h && a();
    };
  return {
    Init: y,
    ROWPermitSearch: u,
    ROWPermitSearchReset: h,
    ToggleShowSearchCriteria: l,
    CheckResetSession: v,
  };
})(window.jQuery, window.eServices);
