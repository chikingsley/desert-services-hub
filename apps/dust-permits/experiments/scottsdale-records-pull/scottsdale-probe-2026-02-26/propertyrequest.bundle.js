var PropertyRequest;
!((n) => {
  typeof define == "function" && define.amd
    ? define(["jquery"], n)
    : typeof module == "object" && module.exports
      ? (module.exports = n(require("jquery")))
      : n(jQuery);
})((n) => {
  var i, r, t;
  return (
    n.extend(n.fn, {
      validate(t) {
        if (!this.length) {
          return void (
            t &&
            t.debug &&
            window.console &&
            console.warn("Nothing selected, can't validate, returning nothing.")
          );
        }
        var i = n.data(this[0], "validator");
        return i
          ? i
          : (this.attr("novalidate", "novalidate"),
            (i = new n.validator(t, this[0])),
            n.data(this[0], "validator", i),
            i.settings.onsubmit &&
              (this.on("click.validate", ":submit", function (t) {
                i.submitButton = t.currentTarget;
                n(this).hasClass("cancel") && (i.cancelSubmit = !0);
                void 0 !== n(this).attr("formnovalidate") &&
                  (i.cancelSubmit = !0);
              }),
              this.on("submit.validate", (t) => {
                function r() {
                  var r, u;
                  return (
                    i.submitButton &&
                      (i.settings.submitHandler || i.formSubmitted) &&
                      (r = n("<input type='hidden'/>")
                        .attr("name", i.submitButton.name)
                        .val(n(i.submitButton).val())
                        .appendTo(i.currentForm)),
                    !(i.settings.submitHandler && !i.settings.debug) ||
                      ((u = i.settings.submitHandler.call(i, i.currentForm, t)),
                      r && r.remove(),
                      void 0 !== u && u)
                  );
                }
                return (
                  i.settings.debug && t.preventDefault(),
                  i.cancelSubmit
                    ? ((i.cancelSubmit = !1), r())
                    : i.form()
                      ? i.pendingRequest
                        ? ((i.formSubmitted = !0), !1)
                        : r()
                      : (i.focusInvalid(), !1)
                );
              })),
            i);
      },
      valid() {
        var t, i, r;
        return (
          n(this[0]).is("form")
            ? (t = this.validate().form())
            : ((r = []),
              (t = !0),
              (i = n(this[0].form).validate()),
              this.each(function () {
                t = i.element(this) && t;
                t || (r = r.concat(i.errorList));
              }),
              (i.errorList = r)),
          t
        );
      },
      rules(t, i) {
        var e,
          s,
          f,
          u,
          o,
          h,
          r = this[0],
          c =
            typeof this.attr("contenteditable") != "undefined" &&
            this.attr("contenteditable") !== "false";
        if (
          r != null &&
          (!r.form &&
            c &&
            ((r.form = this.closest("form")[0]), (r.name = this.attr("name"))),
          r.form != null)
        ) {
          if (t) {
            switch (
              ((e = n.data(r.form, "validator").settings),
              (s = e.rules),
              (f = n.validator.staticRules(r)),
              t)
            ) {
              case "add":
                n.extend(f, n.validator.normalizeRule(i));
                delete f.messages;
                s[r.name] = f;
                i.messages &&
                  (e.messages[r.name] = n.extend(
                    e.messages[r.name],
                    i.messages
                  ));
                break;
              case "remove":
                return i
                  ? ((h = {}),
                    n.each(i.split(/\s/), (n, t) => {
                      h[t] = f[t];
                      delete f[t];
                    }),
                    h)
                  : (delete s[r.name], f);
            }
          }
          return (
            (u = n.validator.normalizeRules(
              n.extend(
                {},
                n.validator.classRules(r),
                n.validator.attributeRules(r),
                n.validator.dataRules(r),
                n.validator.staticRules(r)
              ),
              r
            )),
            u.required &&
              ((o = u.required),
              delete u.required,
              (u = n.extend({ required: o }, u))),
            u.remote &&
              ((o = u.remote),
              delete u.remote,
              (u = n.extend(u, { remote: o }))),
            u
          );
        }
      },
    }),
    (i = (n) => n.replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, "")),
    n.extend(n.expr.pseudos || n.expr[":"], {
      blank(t) {
        return !i("" + n(t).val());
      },
      filled(t) {
        var r = n(t).val();
        return r !== null && !!i("" + r);
      },
      unchecked(t) {
        return !n(t).prop("checked");
      },
    }),
    (n.validator = function (t, i) {
      this.settings = n.extend(!0, {}, n.validator.defaults, t);
      this.currentForm = i;
      this.init();
    }),
    (n.validator.format = function (t, i) {
      return arguments.length === 1
        ? function () {
            var i = n.makeArray(arguments);
            return i.unshift(t), n.validator.format.apply(this, i);
          }
        : void 0 === i
          ? t
          : (arguments.length > 2 &&
              i.constructor !== Array &&
              (i = n.makeArray(arguments).slice(1)),
            i.constructor !== Array && (i = [i]),
            n.each(i, (n, i) => {
              t = t.replace(new RegExp("\\{" + n + "\\}", "g"), () => i);
            }),
            t);
    }),
    n.extend(n.validator, {
      defaults: {
        messages: {},
        groups: {},
        rules: {},
        errorClass: "error",
        pendingClass: "pending",
        validClass: "valid",
        errorElement: "label",
        focusCleanup: !1,
        focusInvalid: !0,
        errorContainer: n([]),
        errorLabelContainer: n([]),
        onsubmit: !0,
        ignore: ":hidden",
        ignoreTitle: !1,
        onfocusin(n) {
          this.lastActive = n;
          this.settings.focusCleanup &&
            (this.settings.unhighlight &&
              this.settings.unhighlight.call(
                this,
                n,
                this.settings.errorClass,
                this.settings.validClass
              ),
            this.hideThese(this.errorsFor(n)));
        },
        onfocusout(n) {
          !this.checkable(n) &&
            (n.name in this.submitted || !this.optional(n)) &&
            this.element(n);
        },
        onkeyup(t, i) {
          (i.which === 9 && this.elementValue(t) === "") ||
            n.inArray(
              i.keyCode,
              [16, 17, 18, 20, 35, 36, 37, 38, 39, 40, 45, 144, 225]
            ) !== -1 ||
            ((t.name in this.submitted || t.name in this.invalid) &&
              this.element(t));
        },
        onclick(n) {
          n.name in this.submitted
            ? this.element(n)
            : n.parentNode.name in this.submitted && this.element(n.parentNode);
        },
        highlight(t, i, r) {
          t.type === "radio"
            ? this.findByName(t.name).addClass(i).removeClass(r)
            : n(t).addClass(i).removeClass(r);
        },
        unhighlight(t, i, r) {
          t.type === "radio"
            ? this.findByName(t.name).removeClass(i).addClass(r)
            : n(t).removeClass(i).addClass(r);
        },
      },
      setDefaults(t) {
        n.extend(n.validator.defaults, t);
      },
      messages: {
        required: "This field is required.",
        remote: "Please fix this field.",
        email: "Please enter a valid email address.",
        url: "Please enter a valid URL.",
        date: "Please enter a valid date.",
        dateISO: "Please enter a valid date (ISO).",
        number: "Please enter a valid number.",
        digits: "Please enter only digits.",
        equalTo: "Please enter the same value again.",
        maxlength: n.validator.format(
          "Please enter no more than {0} characters."
        ),
        minlength: n.validator.format("Please enter at least {0} characters."),
        rangelength: n.validator.format(
          "Please enter a value between {0} and {1} characters long."
        ),
        range: n.validator.format("Please enter a value between {0} and {1}."),
        max: n.validator.format(
          "Please enter a value less than or equal to {0}."
        ),
        min: n.validator.format(
          "Please enter a value greater than or equal to {0}."
        ),
        step: n.validator.format("Please enter a multiple of {0}."),
      },
      autoCreateRanges: !1,
      prototype: {
        init() {
          function i(t) {
            var e =
              typeof n(this).attr("contenteditable") != "undefined" &&
              n(this).attr("contenteditable") !== "false";
            if (
              (!this.form &&
                e &&
                ((this.form = n(this).closest("form")[0]),
                (this.name = n(this).attr("name"))),
              r === this.form)
            ) {
              var u = n.data(this.form, "validator"),
                f = "on" + t.type.replace(/^validate/, ""),
                i = u.settings;
              i[f] && !n(this).is(i.ignore) && i[f].call(u, this, t);
            }
          }
          this.labelContainer = n(this.settings.errorLabelContainer);
          this.errorContext =
            (this.labelContainer.length && this.labelContainer) ||
            n(this.currentForm);
          this.containers = n(this.settings.errorContainer).add(
            this.settings.errorLabelContainer
          );
          this.submitted = {};
          this.valueCache = {};
          this.pendingRequest = 0;
          this.pending = {};
          this.invalid = {};
          this.reset();
          var t,
            r = this.currentForm,
            u = (this.groups = {});
          n.each(this.settings.groups, (t, i) => {
            typeof i == "string" && (i = i.split(/\s/));
            n.each(i, (n, i) => {
              u[i] = t;
            });
          });
          t = this.settings.rules;
          n.each(t, (i, r) => {
            t[i] = n.validator.normalizeRule(r);
          });
          n(this.currentForm)
            .on(
              "focusin.validate focusout.validate keyup.validate",
              ":text, [type='password'], [type='file'], select, textarea, [type='number'], [type='search'], [type='tel'], [type='url'], [type='email'], [type='datetime'], [type='date'], [type='month'], [type='week'], [type='time'], [type='datetime-local'], [type='range'], [type='color'], [type='radio'], [type='checkbox'], [contenteditable], [type='button']",
              i
            )
            .on(
              "click.validate",
              "select, option, [type='radio'], [type='checkbox']",
              i
            );
          this.settings.invalidHandler &&
            n(this.currentForm).on(
              "invalid-form.validate",
              this.settings.invalidHandler
            );
        },
        form() {
          return (
            this.checkForm(),
            n.extend(this.submitted, this.errorMap),
            (this.invalid = n.extend({}, this.errorMap)),
            this.valid() ||
              n(this.currentForm).triggerHandler("invalid-form", [this]),
            this.showErrors(),
            this.valid()
          );
        },
        checkForm() {
          this.prepareForm();
          for (
            var n = 0, t = (this.currentElements = this.elements());
            t[n];
            n++
          ) {
            this.check(t[n]);
          }
          return this.valid();
        },
        element(t) {
          var e,
            o,
            i = this.clean(t),
            r = this.validationTargetFor(i),
            f = !0;
          return (
            void 0 === r
              ? delete this.invalid[i.name]
              : (this.prepareElement(r),
                (this.currentElements = n(r)),
                (o = this.groups[r.name]),
                o &&
                  n.each(this.groups, (n, t) => {
                    t === o &&
                      n !== r.name &&
                      ((i = this.validationTargetFor(
                        this.clean(this.findByName(n))
                      )),
                      i &&
                        i.name in this.invalid &&
                        (this.currentElements.push(i),
                        (f = this.check(i) && f)));
                  }),
                (e = this.check(r) !== !1),
                (f = f && e),
                (this.invalid[r.name] = e ? !1 : !0),
                this.numberOfInvalids() ||
                  (this.toHide = this.toHide.add(this.containers)),
                this.showErrors(),
                n(t).attr("aria-invalid", !e)),
            f
          );
        },
        showErrors(t) {
          if (t) {
            n.extend(this.errorMap, t);
            this.errorList = n.map(this.errorMap, (n, t) => ({
              message: n,
              element: this.findByName(t)[0],
            }));
            this.successList = n.grep(this.successList, (n) => !(n.name in t));
          }
          this.settings.showErrors
            ? this.settings.showErrors.call(this, this.errorMap, this.errorList)
            : this.defaultShowErrors();
        },
        resetForm() {
          n.fn.resetForm && n(this.currentForm).resetForm();
          this.invalid = {};
          this.submitted = {};
          this.prepareForm();
          this.hideErrors();
          var t = this.elements()
            .removeData("previousValue")
            .removeAttr("aria-invalid");
          this.resetElements(t);
        },
        resetElements(n) {
          var t;
          if (this.settings.unhighlight) {
            for (t = 0; n[t]; t++) {
              this.settings.unhighlight.call(
                this,
                n[t],
                this.settings.errorClass,
                ""
              ),
                this.findByName(n[t].name).removeClass(
                  this.settings.validClass
                );
            }
          } else {
            n.removeClass(this.settings.errorClass).removeClass(
              this.settings.validClass
            );
          }
        },
        numberOfInvalids() {
          return this.objectLength(this.invalid);
        },
        objectLength(n) {
          var t,
            i = 0;
          for (t in n) {
            void 0 !== n[t] && n[t] !== null && n[t] !== !1 && i++;
          }
          return i;
        },
        hideErrors() {
          this.hideThese(this.toHide);
        },
        hideThese(n) {
          n.not(this.containers).text("");
          this.addWrapper(n).hide();
        },
        valid() {
          return this.size() === 0;
        },
        size() {
          return this.errorList.length;
        },
        focusInvalid() {
          if (this.settings.focusInvalid) {
            try {
              n(
                this.findLastActive() ||
                  (this.errorList.length && this.errorList[0].element) ||
                  []
              )
                .filter(":visible")
                .trigger("focus")
                .trigger("focusin");
            } catch (t) {}
          }
        },
        findLastActive() {
          var t = this.lastActive;
          return (
            t &&
            n.grep(this.errorList, (n) => n.element.name === t.name).length ===
              1 &&
            t
          );
        },
        elements() {
          var t = this,
            i = {};
          return n(this.currentForm)
            .find("input, select, textarea, [contenteditable]")
            .not(":submit, :reset, :image, :disabled")
            .not(this.settings.ignore)
            .filter(function () {
              var r = this.name || n(this).attr("name"),
                u =
                  typeof n(this).attr("contenteditable") != "undefined" &&
                  n(this).attr("contenteditable") !== "false";
              return (
                !r &&
                  t.settings.debug &&
                  window.console &&
                  console.error("%o has no name assigned", this),
                u &&
                  ((this.form = n(this).closest("form")[0]), (this.name = r)),
                this.form === t.currentForm &&
                  !(r in i || !t.objectLength(n(this).rules())) &&
                  ((i[r] = !0), !0)
              );
            });
        },
        clean(t) {
          return n(t)[0];
        },
        errors() {
          var t = this.settings.errorClass.split(" ").join(".");
          return n(this.settings.errorElement + "." + t, this.errorContext);
        },
        resetInternals() {
          this.successList = [];
          this.errorList = [];
          this.errorMap = {};
          this.toShow = n([]);
          this.toHide = n([]);
        },
        reset() {
          this.resetInternals();
          this.currentElements = n([]);
        },
        prepareForm() {
          this.reset();
          this.toHide = this.errors().add(this.containers);
        },
        prepareElement(n) {
          this.reset();
          this.toHide = this.errorsFor(n);
        },
        elementValue(t) {
          var i,
            r,
            u = n(t),
            f = t.type,
            e =
              typeof u.attr("contenteditable") != "undefined" &&
              u.attr("contenteditable") !== "false";
          return f === "radio" || f === "checkbox"
            ? this.findByName(t.name).filter(":checked").val()
            : f === "number" && typeof t.validity != "undefined"
              ? t.validity.badInput
                ? "NaN"
                : u.val()
              : ((i = e ? u.text() : u.val()),
                f === "file"
                  ? i.substr(0, 12) === "C:\\fakepath\\"
                    ? i.substr(12)
                    : ((r = i.lastIndexOf("/")),
                      r >= 0
                        ? i.substr(r + 1)
                        : ((r = i.lastIndexOf("\\")),
                          r >= 0 ? i.substr(r + 1) : i))
                  : typeof i == "string"
                    ? i.replace(/\r/g, "")
                    : i);
        },
        check(t) {
          t = this.validationTargetFor(this.clean(t));
          var u,
            f,
            r,
            e,
            i = n(t).rules(),
            c = n.map(i, (n, t) => t).length,
            s = !1,
            h = this.elementValue(t);
          typeof i.normalizer == "function"
            ? (e = i.normalizer)
            : typeof this.settings.normalizer == "function" &&
              (e = this.settings.normalizer);
          e && ((h = e.call(t, h)), delete i.normalizer);
          for (f in i) {
            r = { method: f, parameters: i[f] };
            try {
              if (
                ((u = n.validator.methods[f].call(this, h, t, r.parameters)),
                u === "dependency-mismatch" && c === 1)
              ) {
                s = !0;
                continue;
              }
              if (((s = !1), u === "pending")) {
                return void (this.toHide = this.toHide.not(this.errorsFor(t)));
              }
              if (!u) {
                return this.formatAndAdd(t, r), !1;
              }
            } catch (o) {
              throw (
                (this.settings.debug &&
                  window.console &&
                  console.log(
                    "Exception occurred when checking element " +
                      t.id +
                      ", check the '" +
                      r.method +
                      "' method.",
                    o
                  ),
                o instanceof TypeError &&
                  (o.message +=
                    ".  Exception occurred when checking element " +
                    t.id +
                    ", check the '" +
                    r.method +
                    "' method."),
                o)
              );
            }
          }
          if (!s) {
            return this.objectLength(i) && this.successList.push(t), !0;
          }
        },
        customDataMessage(t, i) {
          return (
            n(t).data(
              "msg" + i.charAt(0).toUpperCase() + i.substring(1).toLowerCase()
            ) || n(t).data("msg")
          );
        },
        customMessage(n, t) {
          var i = this.settings.messages[n];
          return i && (i.constructor === String ? i : i[t]);
        },
        findDefined() {
          for (var n = 0; n < arguments.length; n++) {
            if (void 0 !== arguments[n]) {
              return arguments[n];
            }
          }
        },
        defaultMessage(t, i) {
          typeof i == "string" && (i = { method: i });
          var r = this.findDefined(
              this.customMessage(t.name, i.method),
              this.customDataMessage(t, i.method),
              (!this.settings.ignoreTitle && t.title) || void 0,
              n.validator.messages[i.method],
              "<strong>Warning: No message defined for " + t.name + "</strong>"
            ),
            u = /\$?\{(\d+)\}/g;
          return (
            typeof r == "function"
              ? (r = r.call(this, i.parameters, t))
              : u.test(r) &&
                (r = n.validator.format(r.replace(u, "{$1}"), i.parameters)),
            r
          );
        },
        formatAndAdd(n, t) {
          var i = this.defaultMessage(n, t);
          this.errorList.push({ message: i, element: n, method: t.method });
          this.errorMap[n.name] = i;
          this.submitted[n.name] = i;
        },
        addWrapper(n) {
          return (
            this.settings.wrapper &&
              (n = n.add(n.parent(this.settings.wrapper))),
            n
          );
        },
        defaultShowErrors() {
          for (var i, t, n = 0; this.errorList[n]; n++) {
            (t = this.errorList[n]),
              this.settings.highlight &&
                this.settings.highlight.call(
                  this,
                  t.element,
                  this.settings.errorClass,
                  this.settings.validClass
                ),
              this.showLabel(t.element, t.message);
          }
          if (
            (this.errorList.length &&
              (this.toShow = this.toShow.add(this.containers)),
            this.settings.success)
          ) {
            for (n = 0; this.successList[n]; n++) {
              this.showLabel(this.successList[n]);
            }
          }
          if (this.settings.unhighlight) {
            for (n = 0, i = this.validElements(); i[n]; n++) {
              this.settings.unhighlight.call(
                this,
                i[n],
                this.settings.errorClass,
                this.settings.validClass
              );
            }
          }
          this.toHide = this.toHide.not(this.toShow);
          this.hideErrors();
          this.addWrapper(this.toShow).show();
        },
        validElements() {
          return this.currentElements.not(this.invalidElements());
        },
        invalidElements() {
          return n(this.errorList).map(function () {
            return this.element;
          });
        },
        showLabel(t, i) {
          var u,
            s,
            e,
            o,
            r = this.errorsFor(t),
            h = this.idOrName(t),
            f = n(t).attr("aria-describedby");
          r.length
            ? (r
                .removeClass(this.settings.validClass)
                .addClass(this.settings.errorClass),
              r.html(i))
            : ((r = n("<" + this.settings.errorElement + ">")
                .attr("id", h + "-error")
                .addClass(this.settings.errorClass)
                .html(i || "")),
              (u = r),
              this.settings.wrapper &&
                (u = r
                  .hide()
                  .show()
                  .wrap("<" + this.settings.wrapper + "/>")
                  .parent()),
              this.labelContainer.length
                ? this.labelContainer.append(u)
                : this.settings.errorPlacement
                  ? this.settings.errorPlacement.call(this, u, n(t))
                  : u.insertAfter(t),
              r.is("label")
                ? r.attr("for", h)
                : r.parents("label[for='" + this.escapeCssMeta(h) + "']")
                    .length === 0 &&
                  ((e = r.attr("id")),
                  f
                    ? f.match(
                        new RegExp("\\b" + this.escapeCssMeta(e) + "\\b")
                      ) || (f += " " + e)
                    : (f = e),
                  n(t).attr("aria-describedby", f),
                  (s = this.groups[t.name]),
                  s &&
                    ((o = this),
                    n.each(o.groups, (t, i) => {
                      i === s &&
                        n(
                          "[name='" + o.escapeCssMeta(t) + "']",
                          o.currentForm
                        ).attr("aria-describedby", r.attr("id"));
                    }))));
          !i &&
            this.settings.success &&
            (r.text(""),
            typeof this.settings.success == "string"
              ? r.addClass(this.settings.success)
              : this.settings.success(r, t));
          this.toShow = this.toShow.add(r);
        },
        errorsFor(t) {
          var r = this.escapeCssMeta(this.idOrName(t)),
            u = n(t).attr("aria-describedby"),
            i = "label[for='" + r + "'], label[for='" + r + "'] *";
          return (
            u && (i = i + ", #" + this.escapeCssMeta(u).replace(/\s+/g, ", #")),
            this.errors().filter(i)
          );
        },
        escapeCssMeta(n) {
          return void 0 === n
            ? ""
            : n.replace(/([\\!"#$%&'()*+,./:;<=>?@[\]^`{|}~])/g, "\\$1");
        },
        idOrName(n) {
          return (
            this.groups[n.name] || (this.checkable(n) ? n.name : n.id || n.name)
          );
        },
        validationTargetFor(t) {
          return (
            this.checkable(t) && (t = this.findByName(t.name)),
            n(t).not(this.settings.ignore)[0]
          );
        },
        checkable(n) {
          return /radio|checkbox/i.test(n.type);
        },
        findByName(t) {
          return n(this.currentForm).find(
            "[name='" + this.escapeCssMeta(t) + "']"
          );
        },
        getLength(t, i) {
          switch (i.nodeName.toLowerCase()) {
            case "select":
              return n("option:selected", i).length;
            case "input":
              if (this.checkable(i)) {
                return this.findByName(i.name).filter(":checked").length;
              }
          }
          return t.length;
        },
        depend(n, t) {
          return (
            !this.dependTypes[typeof n] || this.dependTypes[typeof n](n, t)
          );
        },
        dependTypes: {
          boolean(n) {
            return n;
          },
          string(t, i) {
            return !!n(t, i.form).length;
          },
          function(n, t) {
            return n(t);
          },
        },
        optional(t) {
          var i = this.elementValue(t);
          return (
            !n.validator.methods.required.call(this, i, t) &&
            "dependency-mismatch"
          );
        },
        startRequest(t) {
          this.pending[t.name] ||
            (this.pendingRequest++,
            n(t).addClass(this.settings.pendingClass),
            (this.pending[t.name] = !0));
        },
        stopRequest(t, i) {
          this.pendingRequest--;
          this.pendingRequest < 0 && (this.pendingRequest = 0);
          delete this.pending[t.name];
          n(t).removeClass(this.settings.pendingClass);
          i &&
          this.pendingRequest === 0 &&
          this.formSubmitted &&
          this.form() &&
          this.pendingRequest === 0
            ? (n(this.currentForm).trigger("submit"),
              this.submitButton &&
                n(
                  "input:hidden[name='" + this.submitButton.name + "']",
                  this.currentForm
                ).remove(),
              (this.formSubmitted = !1))
            : !i &&
              this.pendingRequest === 0 &&
              this.formSubmitted &&
              (n(this.currentForm).triggerHandler("invalid-form", [this]),
              (this.formSubmitted = !1));
        },
        previousValue(t, i) {
          return (
            (i = (typeof i == "string" && i) || "remote"),
            n.data(t, "previousValue") ||
              n.data(t, "previousValue", {
                old: null,
                valid: !0,
                message: this.defaultMessage(t, { method: i }),
              })
          );
        },
        destroy() {
          this.resetForm();
          n(this.currentForm)
            .off(".validate")
            .removeData("validator")
            .find(".validate-equalTo-blur")
            .off(".validate-equalTo")
            .removeClass("validate-equalTo-blur")
            .find(".validate-lessThan-blur")
            .off(".validate-lessThan")
            .removeClass("validate-lessThan-blur")
            .find(".validate-lessThanEqual-blur")
            .off(".validate-lessThanEqual")
            .removeClass("validate-lessThanEqual-blur")
            .find(".validate-greaterThanEqual-blur")
            .off(".validate-greaterThanEqual")
            .removeClass("validate-greaterThanEqual-blur")
            .find(".validate-greaterThan-blur")
            .off(".validate-greaterThan")
            .removeClass("validate-greaterThan-blur");
        },
      },
      classRuleSettings: {
        required: { required: !0 },
        email: { email: !0 },
        url: { url: !0 },
        date: { date: !0 },
        dateISO: { dateISO: !0 },
        number: { number: !0 },
        digits: { digits: !0 },
        creditcard: { creditcard: !0 },
      },
      addClassRules(t, i) {
        t.constructor === String
          ? (this.classRuleSettings[t] = i)
          : n.extend(this.classRuleSettings, t);
      },
      classRules(t) {
        var i = {},
          r = n(t).attr("class");
        return (
          r &&
            n.each(r.split(" "), function () {
              this in n.validator.classRuleSettings &&
                n.extend(i, n.validator.classRuleSettings[this]);
            }),
          i
        );
      },
      normalizeAttributeRule(n, t, i, r) {
        /min|max|step/.test(i) &&
          (t === null || /number|range|text/.test(t)) &&
          ((r = Number(r)), isNaN(r) && (r = void 0));
        r || r === 0
          ? (n[i] = r)
          : t === i && t !== "range" && (n[t === "date" ? "dateISO" : i] = !0);
      },
      attributeRules(t) {
        var r,
          i,
          u = {},
          f = n(t),
          e = t.getAttribute("type");
        for (r in n.validator.methods) {
          r === "required"
            ? ((i = t.getAttribute(r)), i === "" && (i = !0), (i = !!i))
            : (i = f.attr(r)),
            this.normalizeAttributeRule(u, e, r, i);
        }
        return (
          u.maxlength &&
            /-1|2147483647|524288/.test(u.maxlength) &&
            delete u.maxlength,
          u
        );
      },
      dataRules(t) {
        var i,
          r,
          u = {},
          f = n(t),
          e = t.getAttribute("type");
        for (i in n.validator.methods) {
          (r = f.data(
            "rule" + i.charAt(0).toUpperCase() + i.substring(1).toLowerCase()
          )),
            r === "" && (r = !0),
            this.normalizeAttributeRule(u, e, i, r);
        }
        return u;
      },
      staticRules(t) {
        var i = {},
          r = n.data(t.form, "validator");
        return (
          r.settings.rules &&
            (i = n.validator.normalizeRule(r.settings.rules[t.name]) || {}),
          i
        );
      },
      normalizeRules(t, i) {
        return (
          n.each(t, (r, u) => {
            if (u === !1) {
              return void delete t[r];
            }
            if (u.param || u.depends) {
              var f = !0;
              switch (typeof u.depends) {
                case "string":
                  f = !!n(u.depends, i.form).length;
                  break;
                case "function":
                  f = u.depends.call(i, i);
              }
              f
                ? (t[r] = void 0 === u.param || u.param)
                : (n.data(i.form, "validator").resetElements(n(i)),
                  delete t[r]);
            }
          }),
          n.each(t, (n, r) => {
            t[n] = typeof r == "function" && n !== "normalizer" ? r(i) : r;
          }),
          n.each(["minlength", "maxlength"], function () {
            t[this] && (t[this] = Number(t[this]));
          }),
          n.each(["rangelength", "range"], function () {
            var n;
            t[this] &&
              (Array.isArray(t[this])
                ? (t[this] = [Number(t[this][0]), Number(t[this][1])])
                : typeof t[this] == "string" &&
                  ((n = t[this].replace(/[[\]]/g, "").split(/[\s,]+/)),
                  (t[this] = [Number(n[0]), Number(n[1])])));
          }),
          n.validator.autoCreateRanges &&
            (t.min != null &&
              t.max != null &&
              ((t.range = [t.min, t.max]), delete t.min, delete t.max),
            t.minlength != null &&
              t.maxlength != null &&
              ((t.rangelength = [t.minlength, t.maxlength]),
              delete t.minlength,
              delete t.maxlength)),
          t
        );
      },
      normalizeRule(t) {
        if (typeof t == "string") {
          var i = {};
          n.each(t.split(/\s/), function () {
            i[this] = !0;
          });
          t = i;
        }
        return t;
      },
      addMethod(t, i, r) {
        n.validator.methods[t] = i;
        n.validator.messages[t] = void 0 !== r ? r : n.validator.messages[t];
        i.length < 3 &&
          n.validator.addClassRules(t, n.validator.normalizeRule(t));
      },
      methods: {
        required(t, i, r) {
          if (!this.depend(r, i)) {
            return "dependency-mismatch";
          }
          if (i.nodeName.toLowerCase() === "select") {
            var u = n(i).val();
            return u && u.length > 0;
          }
          return this.checkable(i)
            ? this.getLength(t, i) > 0
            : void 0 !== t && t !== null && t.length > 0;
        },
        email(n, t) {
          return (
            this.optional(t) ||
            /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/.test(
              n
            )
          );
        },
        url(n, t) {
          return (
            this.optional(t) ||
            /^(?:(?:(?:https?|ftp):)?\/\/)(?:(?:[^\][?/<~#`!@$^&*()+=}|:";',>{ ]|%[0-9A-Fa-f]{2})+(?::(?:[^\][?/<~#`!@$^&*()+=}|:";',>{ ]|%[0-9A-Fa-f]{2})*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z0-9\u00a1-\uffff][a-z0-9\u00a1-\uffff_-]{0,62})?[a-z0-9\u00a1-\uffff]\.)+(?:[a-z\u00a1-\uffff]{2,}\.?))(?::\d{2,5})?(?:[/?#]\S*)?$/i.test(
              n
            )
          );
        },
        date: (() => {
          var n = !1;
          return function (t, i) {
            return (
              n ||
                ((n = !0),
                this.settings.debug &&
                  window.console &&
                  console.warn(
                    "The `date` method is deprecated and will be removed in version '2.0.0'.\nPlease don't use it, since it relies on the Date constructor, which\nbehaves very differently across browsers and locales. Use `dateISO`\ninstead or one of the locale specific methods in `localizations/`\nand `additional-methods.js`."
                  )),
              this.optional(i) || !/Invalid|NaN/.test(new Date(t).toString())
            );
          };
        })(),
        dateISO(n, t) {
          return (
            this.optional(t) ||
            /^\d{4}[/-](0?[1-9]|1[012])[/-](0?[1-9]|[12][0-9]|3[01])$/.test(n)
          );
        },
        number(n, t) {
          return (
            this.optional(t) ||
            /^(?:-?\d+|-?\d{1,3}(?:,\d{3})+)?(?:\.\d+)?$/.test(n)
          );
        },
        digits(n, t) {
          return this.optional(t) || /^\d+$/.test(n);
        },
        minlength(n, t, i) {
          var r = Array.isArray(n) ? n.length : this.getLength(n, t);
          return this.optional(t) || r >= i;
        },
        maxlength(n, t, i) {
          var r = Array.isArray(n) ? n.length : this.getLength(n, t);
          return this.optional(t) || r <= i;
        },
        rangelength(n, t, i) {
          var r = Array.isArray(n) ? n.length : this.getLength(n, t);
          return this.optional(t) || (r >= i[0] && r <= i[1]);
        },
        min(n, t, i) {
          return this.optional(t) || n >= i;
        },
        max(n, t, i) {
          return this.optional(t) || n <= i;
        },
        range(n, t, i) {
          return this.optional(t) || (n >= i[0] && n <= i[1]);
        },
        step(t, i, r) {
          var u,
            f = n(i).attr("type"),
            h = "Step attribute on input type " + f + " is not supported.",
            c = new RegExp("\\b" + f + "\\b"),
            l = f && !c.test("text,number,range"),
            e = (n) => {
              var t = ("" + n).match(/(?:\.(\d+))?$/);
              return t && t[1] ? t[1].length : 0;
            },
            o = (n) => Math.round(n * 10 ** u),
            s = !0;
          if (l) {
            throw new Error(h);
          }
          return (
            (u = e(r)),
            (e(t) > u || o(t) % o(r) != 0) && (s = !1),
            this.optional(i) || s
          );
        },
        equalTo(t, i, r) {
          var u = n(r);
          return (
            this.settings.onfocusout &&
              u.not(".validate-equalTo-blur").length &&
              u
                .addClass("validate-equalTo-blur")
                .on("blur.validate-equalTo", () => {
                  n(i).valid();
                }),
            t === u.val()
          );
        },
        remote(t, i, r, u) {
          if (this.optional(i)) {
            return "dependency-mismatch";
          }
          u = (typeof u == "string" && u) || "remote";
          var f,
            o,
            s,
            e = this.previousValue(i, u);
          return (
            this.settings.messages[i.name] ||
              (this.settings.messages[i.name] = {}),
            (e.originalMessage =
              e.originalMessage || this.settings.messages[i.name][u]),
            (this.settings.messages[i.name][u] = e.message),
            (r = (typeof r == "string" && { url: r }) || r),
            (s = n.param(n.extend({ data: t }, r.data))),
            e.old === s
              ? e.valid
              : ((e.old = s),
                (f = this),
                this.startRequest(i),
                (o = {}),
                (o[i.name] = t),
                n.ajax(
                  n.extend(
                    !0,
                    {
                      mode: "abort",
                      port: "validate" + i.name,
                      dataType: "json",
                      data: o,
                      context: f.currentForm,
                      success(n) {
                        var r,
                          s,
                          h,
                          o = n === !0 || n === "true";
                        f.settings.messages[i.name][u] = e.originalMessage;
                        o
                          ? ((h = f.formSubmitted),
                            f.resetInternals(),
                            (f.toHide = f.errorsFor(i)),
                            (f.formSubmitted = h),
                            f.successList.push(i),
                            (f.invalid[i.name] = !1),
                            f.showErrors())
                          : ((r = {}),
                            (s =
                              n ||
                              f.defaultMessage(i, {
                                method: u,
                                parameters: t,
                              })),
                            (r[i.name] = e.message = s),
                            (f.invalid[i.name] = !0),
                            f.showErrors(r));
                        e.valid = o;
                        f.stopRequest(i, o);
                      },
                    },
                    r
                  )
                ),
                "pending")
          );
        },
      },
    }),
    (t = {}),
    n.ajaxPrefilter
      ? n.ajaxPrefilter((n, i, r) => {
          var u = n.port;
          n.mode === "abort" && (t[u] && t[u].abort(), (t[u] = r));
        })
      : ((r = n.ajax),
        (n.ajax = function (i) {
          var f = ("mode" in i ? i : n.ajaxSettings).mode,
            u = ("port" in i ? i : n.ajaxSettings).port;
          return f === "abort"
            ? (t[u] && t[u].abort(), (t[u] = r.apply(this, arguments)), t[u])
            : r.apply(this, arguments);
        })),
    n
  );
});
$(() => {
  var t = !1,
    n = !1;
  $(document).on("mouseenter", "[rel~=tooltip]", function () {
    var i, r;
    if (
      ((t = $(this)),
      (tip = t.attr("title")),
      (n = $('<div id="tooltip"></div>')),
      !tip || tip == "")
    ) {
      return !1;
    }
    t.removeAttr("title");
    n.css("opacity", 0).html(tip).appendTo("body");
    i = () => {
      var i, r;
      $(window).width() < n.outerWidth() * 1.5
        ? n.css("max-width", $(window).width() / 2)
        : n.css("max-width", 340);
      i = t.offset().left + t.outerWidth() / 2 - n.outerWidth() / 2;
      r = t.offset().top - n.outerHeight() - 20;
      i < 0
        ? ((i = t.offset().left + t.outerWidth() / 2 - 20), n.addClass("left"))
        : n.removeClass("left");
      i + n.outerWidth() > $(window).width()
        ? ((i = t.offset().left - n.outerWidth() + t.outerWidth() / 2 + 20),
          n.addClass("right"))
        : n.removeClass("right");
      r < 0
        ? ((r = t.offset().top + t.outerHeight()), n.addClass("top"))
        : n.removeClass("top");
      n.css({ left: i, top: r }).animate({ top: "+=10", opacity: 1 }, 50);
    };
    i();
    $(window).resize(i);
    r = () => {
      n.animate({ top: "-=10", opacity: 0 }, 50, function () {
        $(this).remove();
      });
      t.attr("title", tip);
    };
    t.on("mouseleave", r);
    n.on("click", r);
  });
});
!((n) => {
  typeof define == "function" && define.amd
    ? define(["jquery"], n)
    : n(typeof exports == "object" ? require("jquery") : jQuery);
})((n) => {
  var i,
    t = navigator.userAgent,
    u = /iphone/i.test(t),
    f = /chrome/i.test(t),
    r = /android/i.test(t);
  n.mask = {
    definitions: { 9: "[0-9]", a: "[A-Za-z]", "*": "[A-Za-z0-9]" },
    autoclear: !0,
    dataName: "rawMaskFn",
    placeholder: "_",
  };
  n.fn.extend({
    caret(n, t) {
      var i;
      if (this.length !== 0 && !this.is(":hidden")) {
        return typeof n == "number"
          ? ((t = typeof t == "number" ? t : n),
            this.each(function () {
              this.setSelectionRange
                ? this.setSelectionRange(n, t)
                : this.createTextRange &&
                  ((i = this.createTextRange()),
                  i.collapse(!0),
                  i.moveEnd("character", t),
                  i.moveStart("character", n),
                  i.select());
            }))
          : (this[0].setSelectionRange
              ? ((n = this[0].selectionStart), (t = this[0].selectionEnd))
              : document.selection &&
                document.selection.createRange &&
                ((i = document.selection.createRange()),
                (n = 0 - i.duplicate().moveStart("character", -1e5)),
                (t = n + i.text.length)),
            { begin: n, end: t });
      }
    },
    unmask() {
      return this.trigger("unmask");
    },
    mask(t, e) {
      var p, l, o, c, h, v, s, a, y;
      return !t && this.length > 0
        ? ((p = n(this[0])), (y = p.data(n.mask.dataName)), y ? y() : void 0)
        : ((e = n.extend(
            {
              autoclear: n.mask.autoclear,
              placeholder: n.mask.placeholder,
              completed: null,
            },
            e
          )),
          (l = n.mask.definitions),
          (o = []),
          (c = s = t.length),
          (h = null),
          n.each(t.split(""), (n, t) => {
            t == "?"
              ? (s--, (c = n))
              : l[t]
                ? (o.push(new RegExp(l[t])),
                  h === null && (h = o.length - 1),
                  c > n && (v = o.length - 1))
                : o.push(null);
          }),
          this.trigger("unmask").each(function () {
            function nt() {
              if (e.completed) {
                for (var n = h; v >= n; n++) {
                  if (o[n] && p[n] === w(n)) {
                    return;
                  }
                }
                e.completed.call(y);
              }
            }
            function w(n) {
              return e.placeholder.charAt(n < e.placeholder.length ? n : 0);
            }
            function b(n) {
              while (++n < s && !o[n]) {}
              return n;
            }
            function ut(n) {
              while (--n >= 0 && !o[n]) {}
              return n;
            }
            function it(n, t) {
              var r, i;
              if (!(n < 0)) {
                for (r = n, i = b(t); s > r; r++) {
                  if (o[r]) {
                    if (!(s > i && o[r].test(p[i]))) {
                      break;
                    }
                    p[r] = p[i];
                    p[i] = w(i);
                    i = b(i);
                  }
                }
                d();
                y.caret(Math.max(h, n));
              }
            }
            function ft(n) {
              for (var r, u, t = n, i = w(n); s > t; t++) {
                if (o[t]) {
                  if (
                    ((r = b(t)),
                    (u = p[t]),
                    (p[t] = i),
                    !(s > r && o[r].test(u)))
                  ) {
                    break;
                  }
                  i = u;
                }
              }
            }
            function et() {
              var t = y.val(),
                n = y.caret();
              if (a && a.length && a.length > t.length) {
                for (k(!0); n.begin > 0 && !o[n.begin - 1]; ) {
                  n.begin--;
                }
                if (n.begin === 0) {
                  while (n.begin < h && !o[n.begin]) {
                    n.begin++;
                  }
                }
                y.caret(n.begin, n.begin);
              } else {
                for (k(!0); n.begin < s && !o[n.begin]; ) {
                  n.begin++;
                }
                y.caret(n.begin, n.begin);
              }
              nt();
            }
            function rt() {
              k();
              y.val() != tt && y.change();
            }
            function ot(n) {
              if (!y.prop("readonly")) {
                var f,
                  i,
                  t,
                  r = n.which || n.keyCode;
                a = y.val();
                r === 8 || r === 46 || (u && r === 127)
                  ? ((f = y.caret()),
                    (i = f.begin),
                    (t = f.end),
                    t - i == 0 &&
                      ((i = r !== 46 ? ut(i) : (t = b(i - 1))),
                      (t = r === 46 ? b(t) : t)),
                    g(i, t),
                    it(i, t - 1),
                    n.preventDefault())
                  : r === 13
                    ? rt.call(this, n)
                    : r === 27 &&
                      (y.val(tt), y.caret(0, k()), n.preventDefault());
              }
            }
            function st(t) {
              var u, e, h, f, i, c;
              y.prop("readonly") ||
                ((f = t.which || t.keyCode),
                (i = y.caret()),
                t.ctrlKey ||
                  t.altKey ||
                  t.metaKey ||
                  f < 32 ||
                  !f ||
                  f === 13 ||
                  ((i.end - i.begin != 0 &&
                    (g(i.begin, i.end), it(i.begin, i.end - 1)),
                  (u = b(i.begin - 1)),
                  s > u && ((e = String.fromCharCode(f)), o[u].test(e))) &&
                    ((ft(u), (p[u] = e), d(), (h = b(u)), r)
                      ? ((c = () => {
                          n.proxy(n.fn.caret, y, h)();
                        }),
                        setTimeout(c, 0))
                      : y.caret(h),
                    i.begin <= v && nt()),
                  t.preventDefault()));
            }
            function g(n, t) {
              for (var i = n; t > i && s > i; i++) {
                o[i] && (p[i] = w(i));
              }
            }
            function d() {
              y.val(p.join(""));
            }
            function k(n) {
              for (var f, r = y.val(), u = -1, t = 0, i = 0; s > t; t++) {
                if (o[t]) {
                  for (p[t] = w(t); i++ < r.length; ) {
                    if (((f = r.charAt(i - 1)), o[t].test(f))) {
                      p[t] = f;
                      u = t;
                      break;
                    }
                  }
                  if (i > r.length) {
                    g(t + 1, s);
                    break;
                  }
                } else {
                  p[t] === r.charAt(i) && i++, c > t && (u = t);
                }
              }
              return (
                n
                  ? d()
                  : c > u + 1
                    ? e.autoclear || p.join("") === ht
                      ? (y.val() && y.val(""), g(0, s))
                      : d()
                    : (d(), y.val(y.val().substring(0, u + 1))),
                c ? t : h
              );
            }
            var y = n(this),
              p = n.map(t.split(""), (n, t) => {
                if (n != "?") {
                  return l[n] ? w(t) : n;
                }
              }),
              ht = p.join(""),
              tt = y.val();
            y.data(n.mask.dataName, () =>
              n.map(p, (n, t) => (o[t] && n != w(t) ? n : null)).join("")
            );
            y.one("unmask", () => {
              y.off(".mask").removeData(n.mask.dataName);
            })
              .on("focus.mask", () => {
                if (!y.prop("readonly")) {
                  clearTimeout(i);
                  var n;
                  tt = y.val();
                  n = k();
                  i = setTimeout(() => {
                    y.get(0) === document.activeElement &&
                      (d(),
                      n == t.replace("?", "").length
                        ? y.caret(0, n)
                        : y.caret(n));
                  }, 10);
                }
              })
              .on("blur.mask", rt)
              .on("keydown.mask", ot)
              .on("keypress.mask", st)
              .on("input.mask paste.mask", () => {
                y.prop("readonly") ||
                  setTimeout(() => {
                    var n = k(!0);
                    y.caret(n);
                    nt();
                  }, 0);
              });
            f && r && y.off("input.mask").on("input.mask", et);
            k();
          }));
    },
  });
});
PropertyRequest = PropertyRequest || {};
PropertyRequest.Index = (() => {
  function u(n, t) {
    var i = document.createElement("a");
    return (
      i.setAttribute("href", t),
      i.setAttribute("target", "_blank"),
      (i.innerHTML = n),
      i
    );
  }
  function p(n) {
    if (n) {
      locstr = n.toUpperCase();
      var t = n.split(" ");
      return t.length > 1
        ? ((pos = $.inArray("BLDG", t)),
          pos != -1 && t.splice(pos, 2),
          t.join(" "))
        : n;
    }
  }
  function f(n, t, i) {
    var r = $("#PRParcelMapUrl").val(),
      u = $.param({ lat: n, long: t, level: i });
    return r + u;
  }
  function w() {
    PropertyRequest.SetbacksSearch.CheckResetSession();
    PropertyRequest.BuildingPermitSearch.CheckResetSession();
    PropertyRequest.ROWPermitSearch.CheckResetSession();
    PropertyRequest.PlanSearch.CheckResetSession();
    PropertyRequest.CaseSearch.CheckResetSession();
    PropertyRequest.DmSearch.CheckResetSession();
  }
  function o(n) {
    var t = {};
    t.APN = n.APN || "";
    t["QS Num"] = n.QS || "";
    t["MCR Num"] = n.McrNum || "";
    t.Zoning = n.FullZoning || "";
    t.Fema = n.FullFema || "";
    $.get(
      ApplicationOptions.BaseUrl + "/PropertyRequest/GetPropertyData",
      { data: t },
      (t) => {
        var i = t.ownername || "";
        $("#selectedOwner").text(i).prop("title", i);
        $("#OwnerName").val(i);
        $("#selectedApn").html(n.APN ? u(n.APN, t.urls.APN.Url) : "");
        $("#selectedMcr").html(
          n.McrNum ? u(n.McrNum, t.urls["MCR Num"].Url) : ""
        );
        $("#selectedZoning").html(
          n.FullZoning ? u(n.FullZoning, t.urls.Zoning.Url) : ""
        );
        $("#selectedAddress").prop(
          "src",
          n.FullAddress ? u(n.FullAddress, f(n.Latitude, n.Longitude, 10)) : ""
        );
        $("#mapBtnAddress").prop(
          "href",
          n.FullAddress ? u(n.FullAddress, f(n.Latitude, n.Longitude, 10)) : ""
        );
        $("#attt").prop("title", t.femaDescription);
        $("#map-spot").attr("href", f(n.Latitude, n.Longitude, 10));
      },
      "json"
    );
    $("#displayAddress").text(n.FullAddress);
    $("#selectedSubdivision")
      .text(n.Subdivision || "")
      .prop("title", n.Subdivision || "");
    $("#selectedApn").text(n.APN || "");
    $("#selectedQs").text(n.QS || "");
    $("#selectedMcr").text(n.McrNum || "");
    $("#selectedZoning").text(n.FullZoning || "");
    $("#selectedLot").text(n.LotNum || "");
    $("#selectedFloodZone")
      .text(n.FullFema || "")
      .prop("title", n.FullFema);
    $("#selectedCharacterArea")
      .text(n.CharArea || "")
      .prop("title", n.CharArea);
    $("#selectedParcel").text(n.Parcel || "");
    $("#MsLink").val(n.MsLink);
    $("#Address").val(n.FullAddress);
    $("#Subdivision").val(n.Subdivision || "");
    $("#Lot").val(n.LotNum || "");
    $("#Apn").val(n.APN || "");
    $("#Qs").val(n.QS || "");
    $("#Mcr").val(n.McrNum || "");
    $("#Zoning").val(n.FullZoning || "");
    $("#FloodZone").val(n.FullFema || "");
    $("#CharacterArea").val(n.CharArea || "");
    $("#Parcel").val(n.Parcel || "");
    $("#subdivision").val(n.Subdivision || "");
    $("#ownerName").val(n.OwnerName || "");
    $("#streetNumber").val(n.StreetNum || "");
    $("#streetName").val(n.StreetName || "");
    $("#streetDir").val(n.StreetDir || "");
    $("#streetType").val(n.StreetType || "");
    $("#lotNumber").val(n.LotNum || "");
    $("#unitNumber").val(n.UnitNumber || "");
    $("#location").val($.trim(p(n.FullAddress)));
    $("#flood-haz-btn").attr("disabled", !1);
    $("#recordsSection, #requestForm, #selectedAddressDiv").show();
    PropertyRequest.SetbacksSearch.SetbacksSearch();
    PropertyRequest.BuildingPermitSearch.BuildingPermitSearch();
    PropertyRequest.ROWPermitSearch.ROWPermitSearch();
    PropertyRequest.PlanSearch.PlanSearch();
    PropertyRequest.CaseSearch.CaseSearch();
    PropertyRequest.DmSearch.DocumentSearch();
  }
  function b() {
    $("#InfoType").html("");
    $("#DevelopmentActivity").html("");
    $("#AdditionalInfo").html("");
    $("#BusinessDescription").html("");
    $("#Naics").html("");
    $("#BusinessUrl").html("");
    $("#SignageTypes").html("");
    $("#SignageInfo").html("");
  }
  function s() {
    b();
    $("#propertyRequestForm").validate().resetForm();
    PropertyRequest.UpdateSummary.ResetSummaryPage();
    $("ul.form-nav li:eq(2), ul.form-nav li:eq(1)")
      .removeClass("active")
      .addClass("disabled");
    $("ul.form-nav li:eq(0)").removeClass("disabled").addClass("active");
    $(".form-content#step-1").show();
    $("ul.form-nav li.active a").trigger("click");
    $("#form-container, #success-container").hide();
    $("body").removeClass("highlight-is-active");
    $(".form-group-container").removeClass("highlight");
    $(".form-group-container > .row").removeClass("dim-row");
    $("#setback").show();
    $("#landuse").show();
    $("#signage").show();
    $("#flood-haz-btn").show();
  }
  function k() {
    $('input[name="HasDevelopmentActivity"]').on("change", function () {
      $(this).is(
        ":checked",
        $("#DevelopmentActivity").val(
          $('input:checkbox:checked[name="HasDevelopmentActivity"]')
            .map(function () {
              return this.value;
            })
            .get()
            .join(", ")
        )
      );
      $(':checkbox[name="HasDevelopmentActivity"]:checked').length === 0 &&
        $("#DevelopmentActivity").val("");
      $("#DevelopmentActivity").valid();
    });
    $("#Address").on("change", function () {
      locationCount = $(this).val() !== "" ? 0 : 1;
    });
    $('input[name="HasSignageTypes"]').on("change", function () {
      $(this).is(
        ":checked",
        $("#SignageTypes").val(
          $('input:checkbox:checked[name="HasSignageTypes"]')
            .map(function () {
              return this.value;
            })
            .get()
            .join(", ")
        )
      );
      $(':checkbox[name="HasSignageTypes"]:checked').length === 0 &&
        $("#SignageTypes").val("");
      $("#SignageTypes").valid();
    });
  }
  function d() {
    $.validator.setDefaults({
      errorClass: "help-block",
      errorElement: "span",
      ignore: [],
      focusCleanup: !0,
      errorPlacement(n, t) {
        t.attr("name") === "HasDevelopmentActivity"
          ? n.insertAfter(".development-activity")
          : t.attr("name") === "HasSignageTypes"
            ? n.insertAfter(".signage-options")
            : n.insertAfter(t);
      },
    });
    $("#propertyRequestForm").validate({
      highlight(n) {
        $(n)
          .css("background-color", "#f2dede")
          .closest(".form-group")
          .addClass("has-error")
          .addClass("text-danger")
          .find(".error")
          .show();
        i = $(".projectInfo-field.has-error").length;
        $("#step-1 .badge").html(i).show();
        $('ul.form-nav li a[href="#step-1"] .badge').html(i).show();
        i === 0 &&
          ($("#step-1 .badge").hide(),
          $('ul.form-nav li a[href="#step-1"] .badge').hide());
        r = $(".summary-field.has-error").length;
        $("#step-2 .badge").html(r).show();
        $('ul.form-nav li a[href="#step-2"] .badge').html(r).show();
        r === 0 &&
          ($("#step-2 .badge").hide(),
          $('ul.form-nav li a[href="#step-2"] .badge').hide());
      },
      unhighlight(n) {
        $(n)
          .css("background-color", "")
          .closest(".form-group")
          .removeClass("has-error")
          .removeClass("text-danger")
          .find(".error")
          .hide();
        i = $(".projectInfo-field.has-error").length;
        $("#step-1 .badge").html(i).show();
        $('ul.form-nav li a[href="#step-1"] .badge').html(i).show();
        i === 0 &&
          ($("#step-1 .badge").hide(),
          $('ul.form-nav li a[href="#step-1"] .badge').hide());
        r = $(".summary-field.has-error").length;
        $("#step-2 .badge").html(r).show();
        $('ul.form-nav li a[href="#step-2"] .badge').html(r).show();
        r === 0 &&
          ($("#step-2 .badge").hide(),
          $('ul.form-nav li a[href="#step-2"] .badge').hide());
      },
      rules: {
        HasDevelopmentActivity: {
          required: {
            depends() {
              return t === "setback";
            },
          },
          minlength: 1,
        },
        HasSignageTypes: {
          required: {
            depends() {
              return t === "signage";
            },
          },
          minlength: 1,
        },
        Naics: { minlength: 5, maxlength: 6 },
        BusinessDescription: {
          required: {
            depends() {
              return t === "landuse";
            },
          },
        },
        ContactEmail: { email: !0 },
      },
      messages: {
        HasDevelopmentActivity: {
          required:
            '<div class="alert alert-danger">At least one activity must be selected</div>',
        },
        HasSignageTypes: {
          required:
            '<div class="alert alert-danger">At least one type must be selected</div>',
        },
        Naics: {
          minlength: "NAICS number must be at least 5 digits",
          maxlength: "NAICS number cannot exceed 6 digits",
        },
      },
    });
  }
  function c() {
    $("input[name=HasDevelopmentActivity]").valid();
    $("#AdditionalInfo").valid();
  }
  function l() {
    $("#BusinessDescription").valid();
    $("#Naics").valid();
  }
  function a() {
    $("input[name=HasSignageTypes]").valid();
    $("#SignageInfo").valid();
  }
  function g() {
    var n = {
      msLink: $("#MsLink").val(),
      address: $("#location").val(),
      subdivision: $("#Subdivision").val(),
      lot: $("#Lot").val(),
      apn: $("#Apn").val(),
      ownerName: $("#OwnerName").val(),
      qs: $("#Qs").val(),
      mcr: $("#Mcr").val(),
      zoning: $("#Zoning").val(),
      floodZone: $("#FloodZone").val(),
      characterArea: $("#CharacterArea").val(),
      parcel: $("#Parcel").val(),
      infoType: y[t],
      developmentActivity: $("#DevelopmentActivity").val(),
      hasDevelopmentActivity: $("#HasDevelopmentActivity").val(),
      businessDescription: $("#BusinessDescription").val(),
      naics: $("#Naics").val(),
      businessUrl: $("#BusinessUrl").val(),
      contactName: $("#ContactName").val(),
      contactEmail: $("#ContactEmail").val(),
      contactPhone: $("#ContactPhone").val(),
      userId: $("#UserId").val(),
      additionalInfo: $("#AdditionalInfo").val(),
      hasSignageTypes: $("#HasSignageTypes").val(),
      signageInfo: $("#SignageInfo").val(),
      signageTypes: $("#SignageTypes").val(),
      requestType: $("#RequestType").val(),
    };
    $.ajax({
      type: "POST",
      url: ApplicationOptions.BaseApiUrl + "/propertyrequest/submit",
      data: n,
      datatype: "json",
      cache: !1,
      success(n) {
        n.success
          ? ($("#form-container").hide(),
            $("#success-container").show(),
            $("#propertyRequestForm").validate().resetForm())
          : alert(n.message);
      },
      error(n, t, i) {
        alert("error " + i);
      },
    });
  }
  var e = !1,
    t = "setback",
    n = 1,
    i = 0,
    r = 0,
    y = { setback: 0, landuse: 1, signage: 2 },
    h,
    v;
  $(document).on("focus", ".phone-number", function () {
    $(this)
      .mask("(999) 999-9999")
      .blur(function () {
        var n = $(this)
            .val()
            .substr($(this).val().indexOf("-") + 1),
          t;
        if (n.length === 3) {
          var i = $(this)
              .val()
              .substr($(this).val().indexOf("-") - 1, 1),
            r = i + n,
            u = $(this).val().substr(0, 9);
          $(this).val(u + "-" + r);
        }
        t = $(this).parents("form");
        $.data(t[0], "validator") && $(this).valid();
      });
  });
  return (
    (h = () => {
      $(document.body).on(
        "keydown.autocomplete, touchend.autocomplete",
        "input#Address",
        function () {
          $(this).autocomplete({
            source(n, t) {
              eServices.AddressAutocomplete(
                "input#Address",
                eServices.SearchType.ADDRESS,
                n,
                t
              );
            },
            minLength: 3,
            select(n, t) {
              return o(t.item), !1;
            },
            open() {
              /iphone|ipad/i.test(navigator.userAgent) &&
                $(".ui-autocomplete").off(
                  "menufocus hover mouseover mouseenter"
                );
            },
          });
        }
      );
    }),
    (setAPNAutoCompleteFunction = () => {
      $(document.body).on(
        "keydown.autocomplete, touchend.autocomplete",
        "input#Apn",
        function () {
          $(this).autocomplete({
            source(n, t) {
              var i = n.term,
                r;
              i.indexOf("-") === -1 &&
                ((r = i.replace(/\D[^.]/g, "")),
                (i = r.slice(0, 3) + "-" + r.slice(3, 5) + "-" + r.slice(5)),
                i.charAt(i.length - 1) === "-" && (i = i.slice(0, -1)));
              eServices.AddressAutocomplete(
                "input#Apn",
                eServices.SearchType.APN,
                n,
                t
              );
            },
            minLength: 5,
            select(n, t) {
              o(t.item);
            },
            open() {
              /iphone|ipad/i.test(navigator.userAgent) &&
                $(".ui-autocomplete").off(
                  "menufocus hover mouseover mouseenter"
                );
            },
          });
        }
      );
    }),
    (v = () => {
      jQuery(document).ready((i) => {
        var f = window.history && window.history.pushState,
          r,
          u;
        i(
          "#form-container, #success-container, #recordsSection, #requestForm, #selectedAddressDiv"
        ).hide();
        i("#flood-haz-btn").prop("disabled", !0);
        r = i('ul.form-nav li a[href^="#step"]');
        u = i(".form-content");
        n = 1;
        u.hide();
        k();
        d();
        i("#Address").on("autocompletechange", (n, t) => {
          (t.item && t.item.FullAddress == i("#Address").val()) ||
            (i("#Address").val(""),
            i("#Apn").val(""),
            i("#selectedAddressDiv").hide());
        });
        i("#Apn").on("autocompletechange", (n, t) => {
          (t.item && t.item.value == i("#Apn").val()) ||
            (i("#Apn").val(""),
            i("#Address").val(""),
            i("#selectedAddressDiv").hide());
        });
        i("#flood-haz-btn").on("click", () => {
          var n =
              "?fullAddr=" +
              encodeURI(i("#Address").val().trim()) +
              "&apn=" +
              i("#Apn").val().trim(),
            t =
              ApplicationOptions.BaseUrl +
              "/PropertyRequest/FloodHazardDetermination" +
              n;
          window.open(t, "_blank");
        });
        i("#setback, #landuse, #signage").on("click", function () {
          i(".setback, .landuse, .signage").hide();
          i("." + this.id).show();
          i('.nav-pills a[href="#step-1"]').tab("show");
          e = i("#form-container").is(":visible");
          e === !0
            ? t === this.id && s()
            : (i("html, body").animate(
                { scrollTop: i(".form-group-container").offset().top - 7 },
                "fast"
              ),
              i("body").addClass("highlight-is-active"),
              i(".form-group-container").addClass("highlight"),
              i(".form-group-container > .row:first-child").addClass("dim-row"),
              i("#setback, #landuse, #signage, #flood-haz-btn").hide(),
              i("#" + this.id).show(),
              i("#form-container").show());
          t = this.id;
        });
        i("ul.form-nav li:eq(0)").removeClass("disabled").addClass("active");
        i(".form-content#step-1").show();
        i("ul.form-nav li.active a").trigger("click");
        r.click(function (t) {
          t.preventDefault();
          var f = i(i(this).attr("href")),
            e = i(this).closest("li");
          e.hasClass("disabled") ||
            (r.closest("li").removeClass("active"),
            e.addClass("active"),
            u.hide(),
            f.show(),
            f[0].id === "step-1" &&
              (i("#previous").hide(),
              i("#next").show(),
              i("#submit-request").hide(),
              (n = 1)),
            f[0].id === "step-2" &&
              (i("#previous").show(),
              i("#next").show(),
              i("#submit-request").hide(),
              (n = 2),
              PropertyRequest.UpdateSummary.UpdateSummaryPage()),
            f[0].id === "step-3" &&
              (i("#previous").show(),
              i("#next").hide(),
              i("#submit-request").show(),
              (n = 3),
              i("#submit-request").attr("disabled", !i("form").valid())));
        });
        i("#next").on("click", () => {
          if (
            (i("ul.form-nav li:eq(" + n + ")").removeClass("disabled"),
            i('ul.form-nav li a[href="#step-' + (n + 1) + '"]').trigger(
              "click",
              [{ src: n }]
            ),
            n !== 3)
          ) {
            switch (t) {
              case "setback":
                c();
                break;
              case "landuse":
                l();
                break;
              case "signage":
                a();
            }
          } else {
            i("#submit-request").attr("disabled", !i("form").valid());
          }
        });
        i("#previous").on("click", () => {
          if (
            (i('ul.form-nav li a[href="#step-' + (n - 1) + '"]').trigger(
              "click",
              [{ src: n }]
            ),
            n === 1)
          ) {
            switch (t) {
              case "setback":
                c();
                break;
              case "landuse":
                l();
                break;
              case "signage":
                a();
            }
          } else {
            i("#propertyRequestForm").valid();
          }
        });
        i("#close-form, #close-success").on(
          "click",
          (n) => (n.stopImmediatePropagation(), s(), !1)
        );
        window.onpopstate = (n) => {
          f && n.state && n.state.step
            ? (n.state.step >= 3 &&
                i(
                  "ul.form-nav li:eq(" + (n.state.step - 1).toString() + ")"
                ).removeClass("disabled"),
              i(
                'ul.form-nav li a[href="#step-' + n.state.step.toString() + '"]'
              ).trigger("click"))
            : i('ul.form-nav li a[href="#step-1"]').trigger("click");
        };
        h();
        setAPNAutoCompleteFunction();
        i('input[type="search"]').bind("mouseup keyup", function (n) {
          var t = i(this),
            r = t.val();
          if (r === "") {
            i("#recordsSection, #requestForm, #selectedAddressDiv").hide();
            i('input[type="search"]').val("");
            t.trigger("change", n.type == "keyup");
            i("#displayAddress").text("");
            i("#flood-haz-btn").attr("disabled", !0);
            PropertyRequest.SetbacksSearch.SetbacksSearchReset();
            PropertyRequest.BuildingPermitSearch.BuildingPermitSearchReset();
            PropertyRequest.ROWPermitSearch.ROWPermitSearchReset();
            PropertyRequest.PlanSearch.PlanSearchReset();
            PropertyRequest.CaseSearch.CaseSearchReset();
            PropertyRequest.DmSearch.DocumentSearchReset();
            return;
          }
          setTimeout(() => {
            var r = t.val(),
              n;
            r == "" &&
              (i("#recordsSection, #requestForm, #selectedAddressDiv").hide(),
              i('input[type="search"]').val(""),
              t.trigger("change", !0),
              (n = i.Event("keydown")),
              (n.which = 13),
              t.trigger(n),
              i("#displayAddress").text(""),
              i("#flood-haz-btn").attr("disabled", !0),
              PropertyRequest.SetbacksSearch.SetbacksSearchReset(),
              PropertyRequest.BuildingPermitSearch.BuildingPermitSearchReset(),
              PropertyRequest.ROWPermitSearch.ROWPermitSearchReset(),
              PropertyRequest.PlanSearch.PlanSearchReset(),
              PropertyRequest.CaseSearch.CaseSearchReset(),
              PropertyRequest.DmSearch.DocumentSearchReset());
          }, 1);
        });
        window.addEventListener("beforeunload", () => {
          w();
        });
        i("#BusinessDescription").prop("required", t == "landuse");
        i("#submit-request").on("click", () => {
          i("form").valid() && g();
        });
        i("#address-tab").trigger("focus");
      });
    }),
    { Init: v }
  );
})(window.jQuery, window.Modernizr);
PropertyRequest = PropertyRequest || {};
PropertyRequest.UpdateSummary = ((n) => {
  function t() {
    return (
      n("#selectedAddressReview").html(n("#location").val()),
      n("#selectedSubdivisionReview").html(n("#Subdivision").val()),
      n("#selectedLotReview").html(n("#Lot").val()),
      n("#selectedApnReview").html(n("#Apn").val()),
      n("#selectedOwnerReview").html(n("#OwnerName").val()),
      n("#selectedQsReview").html(n("#Qs").val()),
      n("#selectedMcrReview").html(n("#Mcr").val()),
      n("#selectedZoningReview").html(n("#Zoning").val()),
      n("#selectedFloodZoneReview").html(n("#FloodZone").val()),
      n("#selectedCharacterAreaReview").html(n("#CharacterArea").val()),
      n("#selectedParcelReview").html(n("#Parcel").val()),
      n("#informationTypeReview").html(
        n("input[name=InfoType]:checked").val() === "True"
          ? "Setback"
          : "Allowed Land Uses"
      ),
      n("#developmentActivityReview").html(n("#DevelopmentActivity").val()),
      n("#additionalInfoReview").html(n("#AdditionalInfo").val()),
      n("#businessDescriptionReview").html(n("#BusinessDescription").val()),
      n("#naicsNumberReview").html(n("#Naics").val()),
      n("#businessUrlReview").html(n("#BusinessUrl").val()),
      n("#signageTypesReview").html(n("#SignageTypes").val()),
      n("#signageInfoReview").html(n("#SignageInfo").val()),
      !0
    );
  }
  function i() {
    t();
  }
  function r() {
    n("#selectedAddressReview").html("");
    n("#selectedSubdivisionReview").html("");
    n("#selectedLotReview").html("");
    n("#selectedApnReview").html("");
    n("#selectedOwnerReview").html("");
    n("#selectedQsReview").html("");
    n("#selectedMcrReview").html("");
    n("#selectedZoningReview").html("");
    n("#selectedFloodZoneReview").html("");
    n("#selectedCharacterAreaReview").html("");
    n("#selectedParcelReview").html("");
    n("#informationTypeReview").html("");
    n("#developmentActivityReview").html("");
    n("#additionalInfoReview").html("");
    n("#businessDescriptionReview").html("");
    n("#naicsNumberReview").html("");
    n("#businessUrlReview").html("");
    n("#signageTypesReview").html("");
    n("#signageInfoReview").html("");
  }
  var u = () => {
    jQuery(document).ready(() => {});
  };
  return {
    Init: u,
    UpdateSummaryData: t,
    ResetSummaryPage: r,
    UpdateSummaryPage: i,
  };
})(window.jQuery, window.Modernizr);
PropertyRequest = PropertyRequest || {};
PropertyRequest.ROWPermitSearch = ((n) => {
  var t,
    r = () => {
      var t = Number.parseInt(n("#rowCurrentPage").val());
      n("#rowCurrentPage").val(t + 1);
      t > 0 ? n("#rowTopBtn").show() : n("#rowTopBtn").hide();
    },
    u = () => {
      var t = Number.parseInt(n("#rowCurrentPage").val()),
        i = Number.parseInt(n("#rowRecordCount").val()) || 0;
      n.ajax({
        type: "POST",
        url:
          ApplicationOptions.BaseUrl +
          "/PropertyRequest/CheckForMoreROWPermits",
        data: { currentPageNumber: t, recordCount: i },
        dataType: "json",
        success(t) {
          t ? n("#rowMoreBtn").show() : n("#rowMoreBtn").hide();
        },
      });
    },
    s = () => {
      n("#rowSearch-progress").removeClass("hidden");
    },
    i = () => {
      n("#rowSearch-progress").addClass("hidden");
    },
    f = () => {
      t = { PageNumber: 0, Location: n("#location").val() };
    },
    e = () => {
      (t === null || typeof t == "undefined") && f();
      var e = Number.parseInt(n("#rowCurrentPage").val());
      t.PageNumber = e;
      n("#rowMoreBtn").hide();
      n.ajax({
        type: "POST",
        url: ApplicationOptions.BaseUrl + "/PropertyRequest/LoadMoreROWPermits",
        data: JSON.stringify(t),
        contentType: "application/json; charset=utf-8",
        dataType: "html",
        success(f) {
          if (
            (n("#rowSearchResults").append(f),
            u(),
            r(),
            n("#rowMoreBtnImg").hide(),
            i(),
            Modernizr.sessionstorage)
          ) {
            var e = window.sessionStorage,
              o = JSON.stringify(n("#rowSearchResults").html()),
              s = Number.parseInt(n("#rowRecordCount").val()) || 0;
            s > 0
              ? e.setItem("rowPermitSearchResults", o)
              : e.setItem("rowPermitSearchResults", JSON.stringify(""));
            e.setItem(
              "rowPermitSearchResultsPage",
              Number.parseInt(n("#currentPage").val())
            );
            e.setItem("rowPermitSearchData", JSON.stringify(t));
          }
        },
        error(t, r, u) {
          i();
          n("#rowMoreBtnImg").hide();
          alert("error " + u);
        },
      });
    },
    h = () => {
      s();
      n("#rowSearchResults").empty();
      n("#rowCurrentPage").val(0);
      f();
      e();
    },
    o = () => {
      if (
        (n("#rowCurrentPage").val(0),
        n("#rowRecordCount").val(0),
        n("#permitNumber").val(""),
        n("#rowSearchResults").empty(),
        n("#projectName").val(""),
        n("#location").val(""),
        n("#ownerName").val(""),
        n("#workOrder").val(""),
        n("#apn").val(""),
        n("#rowTopBtn").hide(),
        n("#rowMoreBtn").hide(),
        i(),
        Modernizr.sessionstorage)
      ) {
        var t = window.sessionStorage;
        t.removeItem("rowPermitSearchResults");
        t.removeItem("rowPermitSearchResultsPage");
        t.removeItem("rowPermitSearchData");
      }
    },
    c = () => {
      document.domain !== "" &&
        document.referrer.indexOf(window.location.domain) === -1 &&
        o();
    },
    l = () => {
      var i, f, o, s;
      n(document).on("click", ".row-item.clickable-div", function () {
        window.open(n(this).data("href"), "_blank");
      });
      n(document).on("click", "#rowMoreBtn", (t) => {
        t.preventDefault();
        n("#rowMoreBtnImg").show();
        e();
      });
      Modernizr.sessionstorage &&
        ((i = window.sessionStorage),
        (f = JSON.parse(i.getItem("rowPermitSearchResults"))),
        f &&
          (n("#rowSearchResults").html(f),
          (o = i.getItem("rowPermitSearchResultsPage")),
          (s = 0),
          isNaN(o) || (s = JSON.parse(o)),
          n("#rowCurrentPage").val(s - 1),
          (t = JSON.parse(i.getItem("rowPermitSearchData"))),
          n("#permitNumber").val(t.PermitNumber),
          n("#projectName").val(t.ProjectName),
          n("#location").val(t.Location),
          n("#ownerName").val(t.OwnerName),
          n("#apn").val(t.APN),
          n("#workOrder").val(t.WorkOrder)),
        u(),
        r(),
        n("#rowMoreBtnImg").hide());
    };
  return {
    Init: l,
    ROWPermitSearch: h,
    ROWPermitSearchReset: o,
    CheckResetSession: c,
  };
})(window.jQuery, window.eServices);
PropertyRequest = PropertyRequest || {};
PropertyRequest.PlanSearch = ((n) => {
  var t,
    r = () => {
      var t = Number.parseInt(n("#plansCurrentPage").val());
      n("#plansCurrentPage").val(t + 1);
      t > 0 ? n("#plansTopBtn").show() : n("#plansTopBtn").hide();
    },
    u = () => {
      var t = Number.parseInt(n("#plansCurrentPage").val()),
        i = Number.parseInt(n("#plansRecordCount").val()) || 0;
      n.ajax({
        type: "POST",
        url: ApplicationOptions.BaseUrl + "/PropertyRequest/CheckForMorePlans",
        data: { currentPageNumber: t, recordCount: i },
        dataType: "json",
        success(t) {
          t ? n("#plansMoreBtn").show() : n("#plansMoreBtn").hide();
        },
      });
    },
    s = () => {
      n("#plansSearch-progress").removeClass("hidden");
    },
    i = () => {
      n("#plansSearch-progress").addClass("hidden");
    },
    f = () => {
      t = {
        PageNumber: 0,
        PlanNumber: n("#planNumber").val(),
        Location: n("#location").val(),
      };
    },
    e = () => {
      (t === null || typeof t == "undefined") && f();
      var e = Number.parseInt(n("#plansCurrentPage").val());
      t.PageNumber = e;
      n("#plansMoreBtn").hide();
      n.ajax({
        type: "POST",
        url: ApplicationOptions.BaseUrl + "/PropertyRequest/LoadMorePlans",
        data: JSON.stringify(t),
        contentType: "application/json; charset=utf-8",
        dataType: "html",
        success(f) {
          if (
            (n("#plansSearchResults").append(f),
            u(),
            r(),
            n("#plansMoreBtnImg").hide(),
            i(),
            Modernizr.sessionstorage)
          ) {
            var e = window.sessionStorage,
              o = JSON.stringify(n("#plansSearchResults").html()),
              s = Number.parseInt(n("#plansRecordCount").val()) || 0;
            s > 0
              ? e.setItem("planSearchResults", o)
              : e.setItem("planSearchResults", JSON.stringify(""));
            e.setItem(
              "planSearchResultsPage",
              Number.parseInt(n("#plansCurrentPage").val())
            );
            e.setItem("planSearchData", JSON.stringify(t));
          }
        },
        error(t, r, u) {
          i();
          n("#plansMoreBtnImg").hide();
          alert("error " + u);
        },
      });
    },
    h = () => {
      s();
      n("#plansSearchResults").empty();
      n("#plansCurrentPage").val(0);
      f();
      e();
    },
    o = () => {
      if (
        (n("#plansCurrentPage").val(0),
        n("#plansRecordCount").val(0),
        n("#caseNumber").val(""),
        n("#plansSearchResults").empty(),
        n("#planNumber").val(""),
        n("#planType").val(""),
        n("#planName").val(""),
        n("#location").val(""),
        n("#caseNumber").val(""),
        n("#plansTopBtn").hide(),
        n("#plansMoreBtn").hide(),
        i(),
        Modernizr.sessionstorage)
      ) {
        var t = window.sessionStorage;
        t.removeItem("planSearchResults");
        t.removeItem("planSearchResultsPage");
        t.removeItem("planSearchData");
      }
    },
    c = () => {
      document.domain !== "" &&
        document.referrer.indexOf(window.location.domain) === -1 &&
        o();
    },
    l = () => {
      var i, f, o;
      n(document).on("click", ".plan-item.clickable-div", function () {
        window.open(n(this).data("href"), "_blank");
      });
      n(document).on("click", "#plansMoreBtn", (t) => {
        t.preventDefault();
        n("#plansMoreBtnImg").show();
        e();
      });
      Modernizr.sessionstorage &&
        ((i = window.sessionStorage),
        (f = JSON.parse(i.getItem("planSearchResults"))),
        f &&
          (n("#plansSearchResults").html(f),
          (o = JSON.parse(i.getItem("planSearchResultsPage"))),
          n("#plansCurrentPage").val(o - 1),
          (t = JSON.parse(i.getItem("planSearchData"))),
          n("#planNumber").val(t.PlanNumber),
          n("#planType").val(t.PlanType),
          n("#planName").val(t.PlanName),
          n("#location").val(t.Location),
          n("#caseNumber").val(t.CaseNumber)),
        u(),
        r(),
        n("#plansMoreBtnImg").hide());
    };
  return { Init: l, PlanSearch: h, PlanSearchReset: o, CheckResetSession: c };
})(window.jQuery, window.eServices);
PropertyRequest = PropertyRequest || {};
PropertyRequest.CaseSearch = ((n) => {
  var t,
    r = () => {
      var t = Number.parseInt(n("#caseCurrentPage").val());
      n("#caseCurrentPage").val(t + 1);
      t > 0 ? n("#caseTopBtn").show() : n("#caseTopBtn").hide();
    },
    u = () => {
      var t = Number.parseInt(n("#caseCurrentPage").val()),
        i = Number.parseInt(n("#caseRecordCount").val()) || 0;
      n.ajax({
        type: "POST",
        url: ApplicationOptions.BaseUrl + "/PropertyRequest/CheckForMoreCases",
        data: { currentPageNumber: t, recordCount: i },
        dataType: "json",
        success(t) {
          t ? n("#caseMoreBtn").show() : n("#caseMoreBtn").hide();
        },
      });
    },
    s = () => {
      n("#caseSearch-progress").removeClass("hidden");
    },
    i = () => {
      n("#caseSearch-progress").addClass("hidden");
    },
    f = () => {
      t = {
        PageNumber: 0,
        CaseNumber: n("#caseNumber").val(),
        CaseType: n("#caseType").val(),
        CaseName: n("#caseName").val(),
        Location: n("#location").val(),
        CaseYear: n("#caseYear").val(),
      };
    },
    e = () => {
      (t === null || typeof t == "undefined") && f();
      var e = Number.parseInt(n("#caseCurrentPage").val());
      t.PageNumber = e;
      n("#caseMoreBtn").hide();
      n.ajax({
        type: "POST",
        url: ApplicationOptions.BaseUrl + "/PropertyRequest/LoadMoreCases",
        data: JSON.stringify(t),
        contentType: "application/json; charset=utf-8",
        dataType: "html",
        success(f) {
          if (
            (n("#caseSearchResults").append(f),
            u(),
            r(),
            n("#caseMoreBtnImg").hide(),
            i(),
            Modernizr.sessionstorage)
          ) {
            var e = window.sessionStorage,
              o = JSON.stringify(n("#caseSearchResults").html()),
              s = Number.parseInt(n("#caseRecordCount").val()) || 0;
            s > 0
              ? e.setItem("caseSearchResults", o)
              : e.setItem("caseSearchResults", JSON.stringify(""));
            e.setItem(
              "caseSearchResultsPage",
              Number.parseInt(n("#caseCurrentPage").val())
            );
            e.setItem("caseSearchData", JSON.stringify(t));
          }
        },
        error(t, r, u) {
          i();
          n("#caseMoreBtnImg").hide();
          alert("error " + u);
        },
      });
    },
    h = () => {
      s();
      n("#caseSearchResults").empty();
      n("#caseCurrentPage").val(0);
      f();
      e();
    },
    o = () => {
      if (
        (n("#caseCurrentPage").val(0),
        n("#caseNumber").val("").focus(),
        n("#caseSearchResults").empty(),
        n("#caseMoreBtn").hide(),
        n("#caseType").val(""),
        n("#caseName").val(""),
        n("#location").val(""),
        n("#caseYear").val(""),
        n("#caseTopBtn").hide(),
        i(),
        Modernizr.sessionstorage)
      ) {
        var t = window.sessionStorage;
        t.removeItem("caseSearchResults");
        t.removeItem("caseSearchResultsPage");
        t.removeItem("caseSearchData");
      }
    },
    c = () => {
      document.domain !== "" &&
        document.referrer.indexOf(window.location.domain) === -1 &&
        o();
    },
    l = () => {
      var i, f, o;
      n(document).on("click", ".case-item.clickable-div", function () {
        window.open(n(this).data("href"), "_blank");
      });
      n(document).on("click", "#caseMoreBtn", (t) => {
        t.preventDefault();
        n("#caseMoreBtnImg").show();
        e();
      });
      Modernizr.sessionstorage &&
        ((i = window.sessionStorage),
        (f = JSON.parse(i.getItem("caseSearchResults"))),
        f &&
          (n("#caseSearchResults").html(f),
          (o = JSON.parse(i.getItem("caseSearchResultsPage"))),
          n("#caseCurrentPage").val(o - 1),
          (t = JSON.parse(i.getItem("caseSearchData"))),
          n("#caseNumber").val(t.CaseNumber),
          n("#caseType").val(t.CaseType),
          n("#caseName").val(t.CaseName),
          n("#location").val(t.Location),
          n("#caseYear").val(t.CaseYear)),
        u(),
        r(),
        n("#caseMoreBtnImg").hide());
    };
  return { Init: l, CaseSearch: h, CaseSearchReset: o, CheckResetSession: c };
})(window.jQuery, window.eServices);
PropertyRequest = PropertyRequest || {};
PropertyRequest.DmSearch = ((n) => {
  var t,
    u = () => {
      var t = Number.parseInt(n("#dmCurrentPage").val());
      n("#dmCurrentPage").val(t + 1);
      t > 0 ? n("#dmTopBtn").show() : n("#dmTopBtn").hide();
    },
    f = () => {
      var t = Number.parseInt(n("#dmCurrentPage").val()),
        i = Number.parseInt(n("#dmRecordCount").val()) || 0;
      n.ajax({
        type: "POST",
        url:
          ApplicationOptions.BaseUrl + "/PropertyRequest/CheckForMoreDocuments",
        data: { currentPageNumber: t, recordCount: i },
        dataType: "json",
        success(t) {
          t ? n("#dmMoreBtn").show() : n("#dmMoreBtn").hide();
        },
      });
    },
    h = () => {
      n("#dmSearch-progress").removeClass("hidden");
    },
    i = () => {
      n("#dmSearch-progress").addClass("hidden");
    },
    c = () => {
      n("#dmLoadingMore-progress").removeClass("hidden");
    },
    r = () => {
      n("#dmLoadingMore-progress").addClass("hidden");
    },
    e = () => {
      t = {
        PageNumber: 0,
        StreetNum: n("#streetNumber").val(),
        StreetDir: n("#streetDir").val(),
        StreetName: n("#streetName").val(),
        StreetType: n("#streetType").val(),
        LotNum: n("#lotNumber").val(),
        DocType: "",
      };
    },
    o = () => {
      (t === null || typeof t == "undefined") && e();
      var o = Number.parseInt(n("#dmCurrentPage").val());
      t.PageNumber = o;
      n("#dmMoreBtn").hide();
      n.ajax({
        type: "POST",
        url: ApplicationOptions.BaseUrl + "/PropertyRequest/LoadMoreDocuments",
        data: JSON.stringify(t),
        contentType: "application/json; charset=utf-8",
        dataType: "html",
        success(e) {
          if (
            (n("#dmSearchResults").append(e),
            f(),
            u(),
            n("#dmMoreBtnImg").hide(),
            i(),
            r(),
            Modernizr.sessionstorage)
          ) {
            var o = window.sessionStorage,
              s = JSON.stringify(n("#dmSearchResults").html()),
              h = Number.parseInt(n("#dmRecordCount").val()) || 0;
            h > 0
              ? o.setItem("dmSearchResults", s)
              : o.setItem("dmSearchResults", JSON.stringify(""));
            o.setItem(
              "dmSearchResultsPage",
              Number.parseInt(n("#dmCurrentPage").val())
            );
            o.setItem("dmSearchData", JSON.stringify(t));
          }
        },
        error(t, u, f) {
          i();
          r();
          n("#dmMoreBtnImg").hide();
          alert("error " + f);
        },
      });
    },
    l = () => {
      h();
      n("#dmSearchResults").empty();
      n("#dmCurrentPage").val(0);
      e();
      o();
    },
    s = () => {
      if (
        (n("#dmCurrentPage").val(0),
        n("#dmRecordCount").val(0),
        n("#dmSearchResults").empty(),
        n("#dmTopBtn").hide(),
        n("#dmMoreBtn").hide(),
        n("#streetNumber").val(""),
        n("#streetName").val(""),
        n("#streetDir").val(""),
        n("#streetType").val(""),
        i(),
        r(),
        Modernizr.sessionstorage)
      ) {
        var t = window.sessionStorage;
        t.removeItem("dmSearchResults");
        t.removeItem("dmSearchResultsPage");
        t.removeItem("dmSearchData");
      }
    },
    a = () => {
      document.domain !== "" &&
        document.referrer.indexOf(window.location.domain) === -1 &&
        s();
    },
    v = () => {
      var i, r, e;
      n(document).on("click", ".document-item.clickable-div", function (t) {
        t.preventDefault();
        window.open(n(this).data("href"), "_blank");
      });
      n(document).on("click", "#dmMoreBtn", (t) => {
        t.preventDefault();
        n("#dmMoreBtnImg").hide();
        c();
        o();
      });
      Modernizr.sessionstorage &&
        ((i = window.sessionStorage),
        (r = JSON.parse(i.getItem("dmSearchResults"))),
        r &&
          (n("#dmResults").html(r),
          (e = JSON.parse(i.getItem("dmSearchResultsPage"))),
          n("#dmCurrentPage").val(e - 1),
          (t = JSON.parse(i.getItem("dmSearchData"))),
          n("#permitNumber").val(t.PermitNumber),
          n("#streetNumber").val(t.StreetNumber),
          n("#streetDir").val(t.StreetDir),
          n("#streetName").val(t.StreetName),
          n("#streetType").val(t.StreetType)),
        f(),
        u(),
        n("#dmMoreBtnImg").hide());
    };
  return {
    Init: v,
    DocumentSearch: l,
    DocumentSearchReset: s,
    CheckResetSession: a,
  };
})(window.jQuery, window.eServices);
PropertyRequest = PropertyRequest || {};
PropertyRequest.BuildingPermitSearch = ((n) => {
  var t,
    r = () => {
      var t = Number.parseInt(n("#permitCurrentPage").val());
      n("#permitCurrentPage").val(t + 1);
      t > 0 ? n("#permitTopBtn").show() : n("#permitTopBtn").hide();
    },
    u = () => {
      var t = Number.parseInt(n("#permitCurrentPage").val()),
        i = Number.parseInt(n("#permitRecordCount").val()) || 0;
      n.ajax({
        type: "POST",
        url:
          ApplicationOptions.BaseUrl +
          "/PropertyRequest/CheckForMoreBuildingPermits",
        data: { currentPageNumber: t, recordCount: i },
        dataType: "json",
        success(t) {
          t ? n("#permitMoreBtn").show() : n("#permitMoreBtn").hide();
        },
      });
    },
    s = () => {
      n("#permitSearch-progress").removeClass("hidden");
    },
    i = () => {
      n("#permitSearch-progress").addClass("hidden");
    },
    f = () => {
      t = {
        PageNumber: 0,
        PermitNumber: n("#permitNumber").val(),
        StreetNumber: n("#streetNumber").val(),
        StreetName: n("#streetName").val(),
        Subdivision: "",
        LotNumber: n("#lotNumber").val(),
        OwnerName: n("#ownerName").val(),
        APN: n("#apn").val(),
        UnitNumber: n("#unitNumber").val(),
      };
    },
    e = () => {
      (t === null || typeof t == "undefined") && f();
      var e = Number.parseInt(n("#permitCurrentPage").val());
      t.PageNumber = e;
      n("#permitMoreBtn").hide();
      n.ajax({
        type: "POST",
        url:
          ApplicationOptions.BaseUrl +
          "/PropertyRequest/LoadMoreBuildingPermits",
        data: JSON.stringify(t),
        contentType: "application/json; charset=utf-8",
        dataType: "html",
        success(f) {
          if (
            (n("#permitSearchResults").append(f),
            u(),
            r(),
            n("#permitMoreBtnImg").hide(),
            i(),
            Modernizr.sessionstorage)
          ) {
            var e = window.sessionStorage,
              o = JSON.stringify(n("#permitSearchResults").html()),
              s = Number.parseInt(n("#permitRecordCount").val()) || 0;
            s > 0
              ? e.setItem("buildingPermitSearchResults", o)
              : e.setItem("buildingPermitSearchResults", JSON.stringify(""));
            e.setItem(
              "buildingPermitSearchResultsPage",
              Number.parseInt(n("#permitCurrentPage").val())
            );
            e.setItem("buildingPermitSearchData", JSON.stringify(t));
          }
        },
        error(t, r, u) {
          i();
          n("#permitMoreBtnImg").hide();
          alert("error " + u);
        },
      });
    },
    h = () => {
      s();
      n("#permitSearchResults").empty();
      n("#permitCurrentPage").val(0);
      f();
      e();
    },
    o = () => {
      if (
        (n("#permitCurrentPage").val(0),
        n("#permitRecordCount").val(0),
        n("#permitNumber").val(""),
        n("#permitSearchResults").empty(),
        n("#streetNumber").val(""),
        n("#streetName").val(""),
        n("#subdivision").val(""),
        n("#lotNumber").val(""),
        n("#ownerName").val(""),
        n("#unitNumber").val(""),
        n("#apn").val(""),
        n("#permitTopBtn").hide(),
        n("#permitMoreBtn").hide(),
        i(),
        Modernizr.sessionstorage)
      ) {
        var t = window.sessionStorage;
        t.removeItem("buildingPermitSearchResults");
        t.removeItem("buildingPermitSearchResultsPage");
        t.removeItem("buildingPermitSearchData");
      }
    },
    c = () => {
      document.domain !== "" &&
        document.referrer.indexOf(window.location.domain) === -1 &&
        o();
    },
    l = () => {
      var i, f, o;
      n(document).on("click", ".permit-item.clickable-div", function (t) {
        t.preventDefault();
        window.open(n(this).data("href"), "_blank");
      });
      n(document).on("click", "#permitMoreBtn", (t) => {
        t.preventDefault();
        n("#permitMoreBtnImg").show();
        e();
      });
      Modernizr.sessionstorage &&
        ((i = window.sessionStorage),
        (f = JSON.parse(i.getItem("buildingPermitSearchResults"))),
        f &&
          (n("#permitSearchResults").html(f),
          (o = JSON.parse(i.getItem("buildingPermitSearchResultsPage"))),
          n("#permitCurrentPage").val(o - 1),
          (t = JSON.parse(i.getItem("buildingPermitSearchData"))),
          n("#permitNumber").val(t.PermitNumber),
          n("#streetNumber").val(t.StreetNumber),
          n("#streetName").val(t.StreetName),
          n("#subdivision").val(t.Subdivision),
          n("#lotNumber").val(t.LotNumber),
          n("#ownerName").val(t.OwnerName),
          n("#apn").val(t.APN),
          n("#unitNumber").val(t.UnitNumber)),
        u(),
        r(),
        n("#permitMoreBtnImg").hide());
    };
  return {
    Init: l,
    BuildingPermitSearch: h,
    BuildingPermitSearchReset: o,
    CheckResetSession: c,
  };
})(window.jQuery, window.eServices);
PropertyRequest = PropertyRequest || {};
PropertyRequest.SetbacksSearch = ((n) => {
  var t,
    u = () => {
      var t = Number.parseInt(n("#setbacksCurrentPage").val());
      n("#setbacksCurrentPage").val(t + 1);
      t > 0 ? n("#setbacksTopBtn").show() : n("#setbacksTopBtn").hide();
    },
    f = () => {
      var t = Number.parseInt(n("#setbacksCurrentPage").val()),
        i = Number.parseInt(n("#setbacksRecordCount").val()) || 0;
      n.ajax({
        type: "POST",
        url:
          ApplicationOptions.BaseUrl + "/PropertyRequest/CheckForMoreSetbacks",
        data: { currentPageNumber: t, recordCount: i },
        dataType: "json",
        success(t) {
          t ? n("#setbacksMoreBtn").show() : n("#setbacksMoreBtn").hide();
        },
      });
    },
    h = () => {
      n("#setbacksSearch-progress").removeClass("hidden");
    },
    i = () => {
      n("#setbacksSearch-progress").addClass("hidden");
    },
    c = () => {
      n("#setbacksLoadingMore-progress").removeClass("hidden");
    },
    r = () => {
      n("#setbacksLoadingMore-progress").addClass("hidden");
    },
    e = () => {
      t = { PageNumber: 0, Mcr: n("#Mcr").val(), DocType: "" };
    },
    o = () => {
      (t === null || typeof t == "undefined") && e();
      var o = Number.parseInt(n("#setbacksCurrentPage").val());
      t.PageNumber = o;
      n("#setbacksMoreBtn").hide();
      n.ajax({
        type: "POST",
        url:
          ApplicationOptions.BaseUrl +
          "/PropertyRequest/LoadMoreSetbackDocuments",
        data: JSON.stringify(t),
        contentType: "application/json; charset=utf-8",
        dataType: "html",
        success(e) {
          if (
            (n("#setbacksSearchResults").append(e),
            f(),
            u(),
            n("#setbacksMoreBtnImg").hide(),
            i(),
            r(),
            Modernizr.sessionstorage)
          ) {
            var o = window.sessionStorage,
              s = JSON.stringify(n("#setbacksSearchResults").html()),
              h = Number.parseInt(n("#setbacksRecordCount").val()) || 0;
            h > 0
              ? o.setItem("setbacksSearchResults", s)
              : o.setItem("setbacksSearchResults", JSON.stringify(""));
            o.setItem(
              "setbacksSearchResultsPage",
              Number.parseInt(n("#setbacksCurrentPage").val())
            );
            o.setItem("setbacksSearchData", JSON.stringify(t));
          }
        },
        error(t, u, f) {
          i();
          r();
          n("#setbacksMoreBtnImg").hide();
          alert("error " + f);
        },
      });
    },
    l = () => {
      h();
      n("#setbacksSearchResults").empty();
      n("#setbacksCurrentPage").val(0);
      e();
      o();
    },
    s = () => {
      if (
        (n("#setbacksCurrentPage").val(0),
        n("#setbacksRecordCount").val(0),
        n("#setbacksSearchResults").empty(),
        n("#setbacksTopBtn").hide(),
        n("#setbacksMoreBtn").hide(),
        n("#streetNumber").val(""),
        n("#streetName").val(""),
        n("#streetDir").val(""),
        n("#streetType").val(""),
        i(),
        r(),
        Modernizr.sessionstorage)
      ) {
        var t = window.sessionStorage;
        t.removeItem("setbacksSearchResults");
        t.removeItem("setbacksSearchResultsPage");
        t.removeItem("setbacksSearchData");
      }
    },
    a = () => {
      document.domain !== "" &&
        document.referrer.indexOf(window.location.domain) === -1 &&
        s();
    },
    v = () => {
      var i, r, e;
      n(document).on("click", ".document-item.clickable-div", function (t) {
        t.preventDefault();
        window.open(n(this).data("href"), "_blank");
      });
      n(document).on("click", "#setbacksMoreBtn", (t) => {
        t.preventDefault();
        n("#setbacksMoreBtnImg").hide();
        c();
        o();
      });
      Modernizr.sessionstorage &&
        ((i = window.sessionStorage),
        (r = JSON.parse(i.getItem("setbacksSearchResults"))),
        r &&
          (n("#setbacksResults").html(r),
          (e = JSON.parse(i.getItem("setbacksSearchResultsPage"))),
          n("#setbacksCurrentPage").val(e - 1),
          (t = JSON.parse(i.getItem("setbacksSearchData"))),
          n("#permitNumber").val(t.PermitNumber),
          n("#streetNumber").val(t.StreetNumber),
          n("#streetDir").val(t.StreetDir),
          n("#streetName").val(t.StreetName),
          n("#streetType").val(t.StreetType)),
        f(),
        u(),
        n("#setbacksMoreBtnImg").hide());
    };
  return {
    Init: v,
    SetbacksSearch: l,
    SetbacksSearchReset: s,
    CheckResetSession: a,
  };
})(window.jQuery, window.eServices);
