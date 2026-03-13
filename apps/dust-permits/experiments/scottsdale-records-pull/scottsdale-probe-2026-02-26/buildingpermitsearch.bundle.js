var Planning = Planning || {};
Planning.BuildingPermitSearch = ((n, t) => {
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
        url:
          ApplicationOptions.BaseUrl +
          "/BuildingPermit/CheckForMoreBuildingPermits",
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
        StreetNumber: n("#streetNumber").val(),
        StreetName: n("#streetName").val(),
        Subdivision: n("#subdivision").val(),
        LotNumber: n("#lotNumber").val(),
        OwnerName: n("#ownerName").val(),
        APN: n("#apn").val(),
        UnitNumber: n("#unitNumber").val(),
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
        url:
          ApplicationOptions.BaseUrl +
          "/BuildingPermit/LoadMoreBuildingPermits",
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
              ? s.setItem("buildingPermitSearchResults", h)
              : s.setItem("buildingPermitSearchResults", JSON.stringify(""));
            s.setItem(
              "buildingPermitSearchResultsPage",
              Number.parseInt(n("#currentPage").val())
            );
            s.setItem("buildingPermitSearchData", JSON.stringify(i));
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
        n("#streetNumber").val(""),
        n("#streetName").val(""),
        n("#subdivision").val(""),
        n("#lotNumber").val(""),
        n("#ownerName").val(""),
        n("#unitNumber").val(""),
        n("#apn").val(""),
        n("#topBtn").hide(),
        n("#moreBtn").hide(),
        r(),
        Modernizr.sessionstorage)
      ) {
        var t = window.sessionStorage;
        t.removeItem("buildingPermitSearchResults");
        t.removeItem("buildingPermitSearchResultsPage");
        t.removeItem("buildingPermitSearchData");
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
      n(
        "#permitNumber,#streetNumber,#streetName,#subdivision,#lotNumber,#ownerName,#apn,#unitNumber"
      ).on("keydown", (n) => {
        n.keyCode === 13 && (n.preventDefault(), u());
      });
      localStorage.buildingPermitDetailsScroll = "";
      n(document).on("click", "#performSearch", () => {
        Planning.SortModal.PrepareSearch();
        n("#moreBtn").hide();
        u();
      });
      Modernizr.sessionstorage &&
        ((t = window.sessionStorage),
        (r = JSON.parse(t.getItem("buildingPermitSearchResults"))),
        r &&
          (n("#searchResults").html(r),
          (o = JSON.parse(t.getItem("buildingPermitSearchResultsPage"))),
          n("#currentPage").val(o - 1),
          (i = JSON.parse(t.getItem("buildingPermitSearchData"))),
          n("#permitNumber").val(i.PermitNumber),
          n("#streetNumber").val(i.StreetNumber),
          n("#streetName").val(i.StreetName),
          n("#subdivision").val(i.Subdivision),
          n("#lotNumber").val(i.LotNumber),
          n("#ownerName").val(i.OwnerName),
          n("#apn").val(i.APN),
          n("#unitNumber").val(i.UnitNumber)),
        e(),
        f(),
        n("#moreBtnImg").hide());
      h = n("#AdditionalSearchCriteria").css("display") === "none";
      h && a();
    };
  return {
    Init: y,
    BuildingPermitSearch: u,
    BuildingPermitSearchReset: h,
    ToggleShowSearchCriteria: l,
    CheckResetSession: v,
  };
})(window.jQuery, window.eServices);
