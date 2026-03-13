var Planning = Planning || {};
Planning.CaseSearch = ((n, t) => {
  var i,
    u = () => {
      var t = Number.parseInt(n("#currentPage").val());
      n("#currentPage").val(t + 1);
      t > 0 ? n("#topBtn").show() : n("#topBtn").hide();
    },
    f = () => {
      var t = Number.parseInt(n("#currentPage").val()),
        i = Number.parseInt(n("#recordCount").val()) || 0;
      n.ajax({
        type: "POST",
        url: ApplicationOptions.BaseUrl + "/Cases/CheckForMoreCases",
        data: { currentPageNumber: t, recordCount: i },
        dataType: "json",
        success(t) {
          t ? n("#moreBtn").show() : n("#moreBtn").hide();
        },
      });
    },
    h = () => {
      n("#search-progress").removeClass("hidden");
    },
    r = () => {
      n("#search-progress").addClass("hidden");
    },
    e = () => {
      i = {
        PageNumber: 0,
        CaseNumber: n("#caseNumber").val(),
        CaseType: n("#caseType").val(),
        CaseName: n("#caseName").val(),
        Location: n("#location").val(),
        CaseYear: n("#caseYear").val(),
        SortProperty: Planning.SortModal.SortProperty(),
        SortOrder: Planning.SortModal.SortOrder(),
      };
    },
    o = () => {
      (i === null || typeof i == "undefined") && e();
      var o = Number.parseInt(n("#currentPage").val());
      i.PageNumber = o;
      n("#moreBtn").hide();
      n.ajax({
        type: "POST",
        url: ApplicationOptions.BaseUrl + "/Cases/LoadMoreCases",
        data: JSON.stringify(i),
        contentType: "application/json; charset=utf-8",
        dataType: "html",
        success(e) {
          if (
            (n("#searchResults").append(e),
            o === 0 && t.helpers.scrollTo("#search-progress"),
            f(),
            u(),
            n("#moreBtnImg").hide(),
            r(),
            Modernizr.sessionstorage)
          ) {
            var s = window.sessionStorage,
              h = JSON.stringify(n("#searchResults").html()),
              c = Number.parseInt(n("#recordCount").val()) || 0;
            c > 0
              ? s.setItem("caseSearchResults", h)
              : s.setItem("caseSearchResults", JSON.stringify(""));
            s.setItem(
              "caseSearchResultsPage",
              Number.parseInt(n("#currentPage").val())
            );
            s.setItem("caseSearchData", JSON.stringify(i));
          }
        },
        error(t, i, u) {
          r();
          n("#moreBtnImg").hide();
          alert("error " + u);
        },
      });
    },
    c = () => {
      (i === null || typeof i == "undefined") && e();
      var o = Number.parseInt(n("#currentPage").val());
      i.PageNumber = o;
      n("#moreBtn").hide();
      n.ajax({
        type: "POST",
        url: ApplicationOptions.BaseUrl + "/Cases/LoadMoreCasesByAddress",
        data: JSON.stringify(i),
        contentType: "application/json; charset=utf-8",
        dataType: "html",
        success(e) {
          if (
            (n("#searchResults").append(e),
            o === 0 && t.helpers.scrollTo("#search-progress"),
            f(),
            u(),
            n("#moreBtnImg").hide(),
            r(),
            Modernizr.sessionstorage)
          ) {
            var s = window.sessionStorage,
              h = JSON.stringify(n("#searchResults").html()),
              c = Number.parseInt(n("#recordCount").val()) || 0;
            c > 0
              ? s.setItem("caseSearchResults", h)
              : s.setItem("caseSearchResults", JSON.stringify(""));
            s.setItem(
              "caseSearchResultsPage",
              Number.parseInt(n("#currentPage").val())
            );
            s.setItem("caseSearchData", JSON.stringify(i));
          }
        },
        error(t, i, u) {
          r();
          n("#moreBtnImg").hide();
          alert("error " + u);
        },
      });
    },
    s = () => {
      h();
      n("#searchResults").empty();
      n("#currentPage").val(0);
      e();
      n("#location").hasClass("address") ? c() : o();
    },
    l = (t) => {
      h();
      n("#searchResults").empty();
      n("#currentPage").val(0);
      i = {
        PageNumber: 0,
        CaseNumber: "",
        CaseType: t,
        CaseName: "",
        Location: "",
        CaseYear: "",
        SortProperty: "case_id",
        SortOrder: Planning.SortModal.SortOrder(),
      };
      n("#caseType").val(t);
      o();
    },
    a = () => {
      if (
        (n("#currentPage").val(0),
        n("#caseNumber").val("").focus(),
        n("#searchResults").empty(),
        n("#moreBtn").hide(),
        n("#caseType").val(""),
        n("#caseName").val(""),
        n("#location")
          .val("")
          .removeClass("address intersection")
          .addClass("location")
          .autocomplete({ disabled: !0 }),
        n("#caseYear").val(""),
        n("#topBtn").hide(),
        n("input, select").prop("disabled", !1),
        n("#caseLocation").prop("checked", !0),
        r(),
        Modernizr.sessionstorage)
      ) {
        var t = window.sessionStorage;
        t.removeItem("caseSearchResults");
        t.removeItem("caseSearchResultsPage");
        t.removeItem("caseSearchData");
      }
    },
    v = () => {
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
    y = () => {
      var r, e, h;
      n('input[type="radio"]').click(function () {
        n("#location").val("");
        n("input, select").prop("disabled", !1);
        n(this).prop("id") === "caseLocation" &&
          n("#location")
            .addClass("location")
            .removeClass("address intersection")
            .autocomplete({ disabled: !0 });
        n(this).prop("id") === "caseAddress" &&
          (n('input:not([type="radio"]):not([id="location"]), select').prop(
            "disabled",
            !0
          ),
          n("#location")
            .removeClass("location intersection")
            .addClass("address")
            .autocomplete({ disabled: !1 }));
        n(this).prop("id") === "caseIntersection" &&
          (n('input:not([type="radio"]):not([id="location"]), select').prop(
            "disabled",
            !0
          ),
          n("#location")
            .removeClass("location address")
            .addClass("intersection")
            .autocomplete({ disabled: !1 }));
      });
      n(document).on("keydown.autocomplete", ".address", function () {
        n(this).autocomplete({
          source(n, i) {
            t.AddressAutocomplete(".address", t.SearchType.ADDRESS, n, i);
          },
          select(n, t) {
            return (this.value = t.item.label), !1;
          },
        });
      });
      n(document).on("keydown.autocomplete", ".intersection", function () {
        n(this).autocomplete({
          source(n, i) {
            t.AddressAutocomplete(
              ".intersection",
              t.SearchType.INTERSECTION,
              n,
              i
            );
          },
          select(n, t) {
            return (this.value = t.item.label), !1;
          },
        });
      });
      n("#searchOptions").attr("title", "Click to hide options");
      n('#caseType option:contains("Select")').attr("disabled", "disabled");
      n(document).on("click", ".clickable-div", function () {
        window.document.location = n(this).data("href");
      });
      n(document).on("click", "#moreBtn", (t) => {
        t.preventDefault();
        n("#moreBtnImg").show();
        o();
      });
      n("#caseNumber,#caseType,#caseName,.location,#caseYear").on(
        "keydown",
        (n) => {
          n.keyCode === 13 && (n.preventDefault(), s());
        }
      );
      localStorage.caseDetailsScroll = "";
      n(document).on("click", "#performSearch", () => {
        Planning.SortModal.PrepareSearch();
        n("#moreBtn").hide();
        s();
      });
      Modernizr.sessionstorage &&
        ((r = window.sessionStorage),
        (e = JSON.parse(r.getItem("caseSearchResults"))),
        e &&
          (n("#searchResults").html(e),
          (h = JSON.parse(r.getItem("caseSearchResultsPage"))),
          n("#currentPage").val(h - 1),
          (i = JSON.parse(r.getItem("caseSearchData"))),
          n("#caseNumber").val(i.CaseNumber),
          n("#caseType").val(i.CaseType),
          n("#caseName").val(i.CaseName),
          n("#location").val(i.Location),
          n("#caseYear").val(i.CaseYear)),
        f(),
        u(),
        n("#moreBtnImg").hide());
      n("input#caseName").autocomplete({
        source(t, i) {
          n.ajax({
            url: ApplicationOptions.BaseUrl + "/cases/CaseNameAutoComplete/",
            type: "POST",
            dataType: "json",
            data: { searchText: t.term },
            success(t) {
              i(
                n.map(
                  t,
                  (n) => ((n.label = n.CaseName), (n.value = n.CaseId), n)
                )
              );
            },
          });
        },
        minLength: 3,
        select(n, t) {
          return (this.value = t.item.label), !1;
        },
      });
      n.ui.autocomplete.prototype._renderItem = function (t, i) {
        var r = this.term.toUpperCase(),
          f = new RegExp(r),
          u = "",
          e = document.activeElement,
          o;
        return (
          e.id === "location"
            ? n("#location").hasClass("address")
              ? (u = i.FullAddress.toUpperCase().replace(
                  f,
                  '<span class="text-primary">' + r + "</span>"
                ))
              : n("#location").hasClass("intersection") &&
                (u = i.Name.toUpperCase().replace(
                  f,
                  '<span class="text-primary">' + r + "</span>"
                ))
            : e.id === "caseName" &&
              (u = i.CaseName.toUpperCase().replace(
                f,
                '<span class="text-primary">' + r + "</span>"
              )),
          (o =
            '<div class="border d-inline-flex w-100 auto-result"><div style="margin: 0 7px;">' +
            u +
            "</div></div>"),
          n("<li></li>")
            .data("item.autocomplete", i)
            .addClass("ui-menu-item")
            .append(o)
            .appendTo(t)
        );
      };
    };
  return {
    Init: y,
    CaseSearch: s,
    CaseFactSheetSearch: l,
    CaseSearchReset: a,
    ToggleShowSearchCriteria: v,
  };
})(window.jQuery, window.eServices);
