const adapter = require('./adapter');

addEventListener('error', function (event) {
  let msg = { message: event.message, filename: event.filename, lineno: event.lineno, colno: event.colno };
  adapter.log_error(msg);
  console.error("options: " + JSON.stringify(msg));
});

function store_settings() {
  adapter.current_browser.storage.local.set({
    aws_params: {
      access_id: $("#aws_access_id").val().trim(),
      secret_key: $("#aws_secret_key").val().trim(),
      session_token: "",
      region: $("#region").val()
    },
    gcp_params: {
      key: $("#gcp_key").val().trim()
    }
  });
}

function handle_btn_as_link() {
  $(".aslink").click(function () { adapter.open_tab($(this).data("href")); });
}

$(function () {
  $("#aws_secret_key").hidePassword(true);
  $("#gcp_key").hidePassword(true);
  $("#tabs").tabs({ event: "mouseover" });
  
  adapter.storage_local_get("aws_params", params => {
    if (params && !$.isEmptyObject(params) && params.aws_params.access_id != "" && params.aws_params.secret_key != "") {
      $("#aws_access_id").val(params.aws_params.access_id);
      $("#aws_secret_key").val(params.aws_params.secret_key);
      $(`#region option[value="${params.aws_params.region}"]`).attr("selected", true);
    }
  });

  adapter.storage_local_get("gcp_params", params => {
    if (params && !$.isEmptyObject(params) && params.gcp_params.key != "") {
      $("#gcp_key").val(params.gcp_params.key);
    }
  });

  handle_btn_as_link();
  $("#aws_access_id").blur(store_settings);
  $("#aws_secret_key").blur(store_settings);
  $("#region").blur(store_settings);
  $("#gcp_key").blur(store_settings);
  //adapter.i18n();
});