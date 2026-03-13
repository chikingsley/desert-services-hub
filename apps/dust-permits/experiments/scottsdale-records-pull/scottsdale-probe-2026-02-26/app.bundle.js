var baseDir =
    window.location.pathname.toLowerCase().indexOf("/bldgresources") === -1
      ? ""
      : "/bldgresources",
  baseUrl,
  baseApiUrl;
baseDir === "" &&
  (baseDir =
    window.location.pathname.toLowerCase().indexOf("/planningprod") === -1
      ? ""
      : "/planningprod");
baseUrl = window.location.protocol + "//" + window.location.host + baseDir;
baseApiUrl = baseUrl + "/api";
ApplicationOptions = { BaseUrl: baseUrl, BaseApiUrl: baseApiUrl };
