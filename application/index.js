"use strict";

import {
  bottom_bar,
  side_toaster,
  load_ads,
  top_bar,
  getManifest,
  geolocation,
} from "./assets/js/helper.js";
import localforage from "localforage";
import { detectMobileOS } from "./assets/js/helper.js";
import m from "mithril";
import dayjs from "dayjs";
import swiped from "swiped-events";
import { request, gql } from "graphql-request";
import L from "leaflet";

const sw_channel = new BroadcastChannel("sw-messages");

const worker = new Worker(new URL("./worker.js", import.meta.url), {
  type: "module",
});

export let status = { debug: false, version: "", notKaiOS: true };

let default_settings = {};

export let settings = {};

localforage
  .getItem("articles")
  .then((value) => {
    if (value === null) {
      // Item does not exist, initialize it as an empty array
      articles = [];
      return localforage.setItem("articles", articles).then(() => {});
    } else {
      articles = value;
    }
  })
  .catch((err) => {
    console.error("Error accessing localForage:", err);
  });

let cache_search = () => {
  localforage.setItem("articles", articles);
};

localforage.getItem("searchTerm").then((e) => {
  searchTerm = e;
});

if ("b2g" in navigator || "navigator.mozApps" in navigator)
  status.notKaiOS = false;

if (!status.notKaiOS) {
  const scripts = [
    "http://127.0.0.1/api/v1/shared/core.js",
    "http://127.0.0.1/api/v1/shared/session.js",
    "http://127.0.0.1/api/v1/apps/service.js",
    "http://127.0.0.1/api/v1/audiovolumemanager/service.js",
    "./assets/js/kaiads.v5.min.js",
  ];

  scripts.forEach((src) => {
    const js = document.createElement("script");
    js.type = "text/javascript";
    js.src = src;
    document.head.appendChild(js);
  });
}

if (status.debug) {
  window.onerror = function (msg, url, linenumber) {
    alert(
      "Error message: " + msg + "\nURL: " + url + "\nLine Number: " + linenumber
    );
    return true;
  };
}

//map

let map;
let step = 0.004;
const mainmarker = { current_lat: 0, current_lng: 0 };
let usersPosition;
let cragsPosition = { lat: 0, lng: 0, name: "" };

// Function to zoom the map
function ZoomMap(in_out) {
  if (!map) return; // Check if the map is initialized

  let current_zoom_level = map.getZoom();
  if (in_out === "in") {
    map.setZoom(current_zoom_level + 1);
  } else if (in_out === "out") {
    map.setZoom(current_zoom_level - 1);
  }
}

// Function to move the map
function MoveMap(direction) {
  let n = map.getCenter();

  mainmarker.current_lat = n.lat;
  mainmarker.current_lng = n.lng;

  if (direction === "left") {
    mainmarker.current_lng -= step;
  } else if (direction === "right") {
    mainmarker.current_lng += step;
  } else if (direction === "up") {
    mainmarker.current_lat += step;
  } else if (direction === "down") {
    mainmarker.current_lat -= step;
  }
  map.panTo(new L.LatLng(mainmarker.current_lat, mainmarker.current_lng));
}

// Initialize the map and define the setup
function map_function(lat, lng) {
  map = L.map("map-container", {
    keyboard: true,
    zoomControl: false,
    shadowUrl: null,
  }).setView([lat, lng], 13);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  let once = false;
  let myMarker;
  L.Icon.Default.prototype.options.shadowUrl = null;
  L.Icon.Default.prototype.options.iconUrl = "marker-icon.png";

  let geolocation_cb = function (e) {
    if (!myMarker) {
      // Create the marker only once
      myMarker = L.marker([e.coords.latitude, e.coords.longitude])
        .addTo(map)
        .bindPopup("It's me")
        .openPopup();
      myMarker._icon.classList.add("myMarker");
      myMarker.options.shadowUrl = null;
      usersPosition = e;
      myMarker.options.url = "marker-icon.png";

      if (!lat) {
        // Set the view only once
        // map.setView([e.coords.latitude, e.coords.longitude]);
        once = true; // Set 'once' to true after the first execution
      }
    } else {
      // Update the marker's position
      myMarker.setLatLng([e.coords.latitude, e.coords.longitude]);
      usersPosition = e;
    }
  };
  geolocation(geolocation_cb);

  L.marker([lat, lng]).addTo(map);
  map.setView([lat, lng]);

  articles.map((e, i) => {
    L.marker([e.metadata.lat, e.metadata.lng]).addTo(map).bindPopup(e.areaName);
  });

  map.on("zoomend", function () {
    let zoom_level = map.getZoom();

    if (zoom_level > 16) {
      step = 0.0005;
    } else if (zoom_level > 15) {
      step = 0.001;
    } else if (zoom_level > 14) {
      step = 0.002;
    } else if (zoom_level > 13) {
      step = 0.004;
    } else if (zoom_level > 12) {
      step = 0.01;
    } else if (zoom_level > 11) {
      step = 0.02;
    } else if (zoom_level > 10) {
      step = 0.04;
    } else if (zoom_level > 9) {
      step = 0.075;
    } else if (zoom_level > 8) {
      step = 0.15;
    } else if (zoom_level > 7) {
      step = 0.3;
    } else if (zoom_level > 6) {
      step = 0.5;
    } else if (zoom_level > 5) {
      step = 1.2;
    } else if (zoom_level > 4) {
      step = 2.75;
    } else if (zoom_level > 3) {
      step = 4.5;
    } else if (zoom_level > 2) {
      step = 8;
    } else {
      step = 20;
    }
  });
}

//open KaiOS app
let app_launcher = () => {
  var currentUrl = window.location.href;

  // Check if the URL includes 'id='
  if (!currentUrl.includes("code=")) return false;

  const params = new URLSearchParams(currentUrl.split("?")[1]);
  const code = params.get("code");

  if (!code) return false;

  let result = code.split("#")[0];

  setTimeout(() => {
    try {
      const activity = new MozActivity({
        name: "feedolin",
        data: result,
      });
      activity.onsuccess = function () {
        console.log("Activity successfuly handled");
        setTimeout(() => {
          window.close();
        }, 4000);
      };

      activity.onerror = function () {
        console.log("The activity encouter en error: " + this.error);
        alert(this.error);
      };
    } catch (e) {
      console.log(e);
    }

    if ("b2g" in navigator) {
      try {
        let activity = new WebActivity("feedolin", {
          name: "feedolin",
          data: result,
        });
        activity.start().then(
          (rv) => {
            setTimeout(() => {
              window.close();
            }, 3000);

            // alert(rv);
          },
          (err) => {
            //alert(err);

            if (err == "NO_PROVIDER") {
            }
          }
        );
      } catch (e) {
        alert(e);
      }
    }
  }, 2000);
};
if (!status.notKaiOS) app_launcher();

//test if device online
let checkOnlineStatus = () => {
  return fetch("https://www.google.com", {
    method: "HEAD",
    mode: "no-cors",
  })
    .then(() => true)
    .catch(() => false);
};

async function fetchGraphQL(query, variables) {
  const response = await fetch("https://api.openbeta.io/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

  return await response.json();
}

const operationsDoc = `
  query MyQuery($search: String!) {
  stats {
    totalClimbs
    totalCrags
  }
    areas(filter: {leaf_status: {isLeaf: false},area_name: {match: $search}}) {
      areaName
      totalClimbs
      uuid
      metadata {
        lat
        lng
        isBoulder
      }
      pathTokens
      climbs {
        uuid
        name
        boltsCount
        gradeContext
        length
        fa
        type {
          bouldering
          sport
          trad
        }
        grades {
          brazilianCrux
          ewbank
          font
          french
          uiaa
          vscale
          yds
        }
      }
      children {
        areaName
        totalClimbs
        uuid
        metadata {
          lat
          lng
          isBoulder
        }
        pathTokens
        climbs {
        uuid
        name
        boltsCount
        gradeContext
        length
        fa
        type {
          bouldering
          sport
          trad
        }
        grades {
          brazilianCrux
          ewbank
          font
          french
          uiaa
          vscale
          yds
        }
      }
        children {
          areaName
          totalClimbs
          uuid
          metadata {
            lat
            lng
            isBoulder
          }
          pathTokens
          climbs {
        uuid
        name
        boltsCount
        gradeContext
        length
        fa
        type {
          bouldering
          sport
          trad
        }
        grades {
          brazilianCrux
          ewbank
          font
          french
          uiaa
          vscale
          yds
        }
      }
          children {
            areaName
            totalClimbs
            uuid
            metadata {
              lat
              lng
              isBoulder
            }
            pathTokens
            climbs {
        uuid
        name
        boltsCount
        gradeContext
        length
        fa
        type {
          bouldering
          sport
          trad
        }
        grades {
          brazilianCrux
          ewbank
          font
          french
          uiaa
          vscale
          yds
        }
      }
            children {  
              areaName
              totalClimbs
              uuid
              metadata {
                lat
                lng
                isBoulder
              }
              pathTokens
              climbs {
        uuid
        name
        boltsCount
        gradeContext
        length
        fa
        type {
          bouldering
          sport
          trad
        }
        grades {
          brazilianCrux
          ewbank
          font
          french
          uiaa
          vscale
          yds
        }
      }
            }
          }
        }
      }
    }
  }
`;
async function fetchAreas(searchValue) {
  try {
    const { errors, data } = await fetchGraphQL(operationsDoc, {
      search: searchValue,
    });
    if (errors) throw new Error(JSON.stringify(errors)); // Throw errors if present
    m.redraw();

    return { success: true, areas: data.areas, stats: data.stats };
  } catch (error) {
    console.error("Error:", error);
    return { success: false, error: error.message };
  }
}

var root = document.getElementById("app");

var options = {
  view: function () {
    return m(
      "div",
      {
        id: "optionsView",
        class: "flex",
        oncreate: () => {
          top_bar("", "", "");

          if (status.notKaiOS)
            top_bar("", "", "<img src='assets/icons/back.svg'>");

          bottom_bar(
            "",
            "<img class='not-desktop' src='assets/icons/select.svg'>",
            ""
          );

          if (status.notKaiOS) bottom_bar("", "", "");
        },
      },
      [
        m(
          "button",
          {
            tabindex: 0,

            class: "item",
            oncreate: ({ dom }) => {
              dom.focus();

              scrollToCenter();
            },
            onclick: () => {
              m.route.set("/about");
            },
          },
          "About"
        ),
        m(
          "button",
          {
            tabindex: 1,

            class: "item",
            onclick: () => {
              m.route.set("/settingsView");
            },
          },
          "Settings"
        ),

        m(
          "button",
          {
            tabindex: 2,

            class: "item",
            onclick: () => {
              m.route.set("/privacy_policy");
            },
          },
          "Privacy Policy"
        ),
        m("div", {
          id: "KaiOSads-Wrapper",
          class: "",

          oncreate: () => {
            if (status.notKaiOS == false) load_ads();
          },
        }),
      ]
    );
  },
};

let articles = [];
let current_article;
let searchTerm = "";
let stats = "";
const start = {
  async search() {
    const result = await fetchAreas(searchTerm);
    if (result.success) {
      articles = result.areas;
      stats = result.stats;
      console.log(stats.totalClimbs);
      cache_search();
    } else {
      console.error("Failed to fetch areas:", result.error);
      articles = [];
    }
  },

  oninit() {
    // Retrieve the `search` parameter from the URL
    const params = m.route.param("search");
    if (params) {
      searchTerm = params;
      this.search();
    }
  },
  onremove: () => {
    scrollToTop();
  },

  view() {
    return m(
      "div",
      {
        id: "start",
        oninit: () => {
          bottom_bar(
            "<img src='assets/icons/map.svg'>",
            "",
            "<img src='assets/icons/option.svg'>"
          );
          top_bar("", "", "");
        },
      },

      m("input[type=text]", {
        class: "item",
        tabIndex: 0,
        placeholder: "Search areas",
        oninput: (e) => {
          searchTerm = e.target.value;
          localforage.setItem("searchTerm", searchTerm);

          // Update the URL parameter
          m.route.set(`/start?search=${encodeURIComponent(searchTerm)}`);

          if (searchTerm.length > 2) {
            this.search();
          } else {
            articles = [];
          }
        },
        value: searchTerm,
      }),

      m(
        "section",
        articles.length > 0
          ? articles.slice(0, 100).map((e, i) =>
              m(
                "article",
                {
                  class: "item",
                  tabIndex: i + 1,
                  onclick: () => {
                    if (e.totalClimbs == 0) {
                      side_toaster("no climbs", 3000);
                    } else {
                      current_article = e.uuid;
                      m.route.set("/article?index=" + e.uuid);
                    }
                  },

                  onkeydown: (event) => {
                    if (event.key === "Enter") {
                      if (e.totalClimbs == 0) {
                        side_toaster("no climbs", 3000);
                      } else {
                        current_article = e.id;
                        m.route.set("/article?index=" + e.uuid);
                      }
                    }
                  },
                },
                [
                  m("div", { class: "tags" }, [
                    m("span", { class: "tag" }, e.pathTokens[0]),

                    e.metadata.isBoulder
                      ? m("span", { class: "tag" }, "Bouldering")
                      : m("span", { class: "tag" }, "Climbing"),
                    m("span", { class: "tag" }, e.totalClimbs),
                  ]),

                  m("h2", e.areaName),
                ]
              )
            )
          : m("p", "")
      ),
      m("section", { id: "stats-footer" }, [
        m("p", "OpenBeta is a free rock climbing route database."),
        m("span", "Climbs " + stats.totalClimbs),
        m("span", "Crags " + stats.totalCrags),
      ])
    );
  },
};

function getAllNestedKeys(obj, key) {
  let results = [];

  function search(obj) {
    if (Array.isArray(obj)) {
      obj.forEach((item) => search(item));
    } else if (typeof obj === "object" && obj !== null) {
      if (obj.hasOwnProperty(key)) {
        results.push(obj[key]);
      }
      Object.values(obj).forEach((value) => search(value));
    }
  }

  search(obj);
  return results.flat(); // Flatten in case each 'climbs' is an array
}

const article = {
  view: function () {
    articles.find((h) => {
      var index = m.route.param("index");
      if (index != h.uuid) return false;

      current_article = h;
      console.log(current_article);

      return true;
    });

    const allClimbs = getAllNestedKeys(current_article, "climbs");

    return m(
      "div",
      {
        id: "article",
        onremove: () => {
          scrollToTop();
        },

        oncreate: () => {
          if (status.notKaiOS)
            top_bar("", "", "<img src='assets/icons/back.svg'>");
          bottom_bar("<img src='assets/icons/map.svg'>", "", "");
        },
      },
      allClimbs.map((climb, i) => {
        return m(
          "article",
          {
            class: "item",
            tabIndex: i + 1,
            onclick: () => {
              current_detail = climb;

              m.route.set(
                "/detail?index=" +
                  current_article.uuid +
                  "&detail=" +
                  climb.uuid
              );
            },
          },
          [
            m("div", { class: "tags" }, [
              Object.entries(current_article.pathTokens)
                .filter(([key, value]) => value !== null)
                .map(([key, value]) => {
                  return value === true
                    ? m("span", { class: "tag" }, key)
                    : null;
                }),

              Object.entries(climb.type)
                .filter(([key, value]) => value !== null)
                .map(([key, value]) => {
                  return value === true
                    ? m("span", { class: "tag" }, key)
                    : null;
                }),

              Object.entries(climb.grades)
                .filter(([key, value]) => value !== null)
                .map(([key, value]) => {
                  return value != ""
                    ? m("span", { class: "tag" }, value)
                    : null;
                }),
            ]),

            m("h2", climb.name),
          ]
        );
      })
    );
  },
};

let current_detail;

var detail = {
  view: function () {
    const matchedArticle = current_article.climbs.find((h) => {
      var index = m.route.param("detail");
      if (index != h.uuid) return false;

      current_detail = h;

      return true;
    });

    return m(
      "div",
      {
        id: "article",
        onremove: () => {
          scrollToTop();
        },
        oncreate: () => {
          if (status.notKaiOS)
            top_bar("", "", "<img src='assets/icons/back.svg'>");
          bottom_bar("<img src='assets/icons/tick.svg'>", "", "");
        },
      },
      m("div", { id: "detail", class: "item" }, [
        m("h2", current_article.areaName),
        m("h2", current_detail.name),

        m("ul", [
          m("li", "First ascent by: " + current_detail.fa),

          Object.entries(current_detail.type)
            .filter(([key, value]) => value !== null)
            .map(([key, value]) => m("li", { class: "tag" }, "Type: " + key)),
          ,
          Object.entries(current_detail.grades)
            .filter(([key, value]) => value !== null)
            .map(([key, value]) =>
              m("li", { class: "tag" }, key + ": " + value)
            ),
          current_detail.length > 0
            ? m("li", "Length: " + current_detail.length)
            : null,
        ]),
      ])
    );
  },
};

let mapView = {
  view: function () {
    return m("div", {
      id: "map-container",

      oncreate: (vnode) => {
        bottom_bar(
          "<img src='assets/icons/plus.svg'>",
          "<img src='assets/icons/person.svg'>",
          "<img src='assets/icons/minus.svg'>"
        );

        const params = new URLSearchParams(m.route.get().split("?")[1]);
        const lat = parseFloat(params.get("lat"));
        const lng = parseFloat(params.get("lng"));

        map_function(lat, lng);

        if (status.notKaiOS)
          top_bar("", "", "<img src='assets/icons/back.svg'>");
      },
    });
  },
};

var intro = {
  view: function () {
    return m(
      "div",
      {
        class: "width-100 height-100",
        id: "intro",
        oninit: () => {
          setTimeout(() => {
            m.route.set("/start", { search: searchTerm });
          }, 2000);
        },
        onremove: () => {
          localStorage.setItem("version", status.version);
          document.querySelector(".loading-spinner").style.display = "none";
        },
      },
      [
        m("img", {
          src: "./assets/icons/intro.svg",

          oncreate: () => {
            document.querySelector(".loading-spinner").style.display = "block";
            let get_manifest_callback = (e) => {
              try {
                status.version = e.manifest.version;
                document.querySelector("#version").textContent =
                  e.manifest.version;
              } catch (e) {}

              if ("b2g" in navigator || status.notKaiOS) {
                fetch("/manifest.webmanifest")
                  .then((r) => r.json())
                  .then((parsedResponse) => {
                    status.version = parsedResponse.b2g_features.version;
                  });
              }
            };
            getManifest(get_manifest_callback);
          },
        }),
        m(
          "div",
          {
            class: "flex width-100  justify-content-center ",
            id: "version-box",
          },
          [
            m(
              "kbd",
              {
                id: "version",
              },
              localStorage.getItem("version") || 0
            ),
          ]
        ),
      ]
    );
  },
};

var about = {
  view: function () {
    return m(
      "div",
      { class: "page" },
      m(
        "p",
        "Feedolin is an RSS/Atom reader and podcast player, available for both KaiOS and non-KaiOS users."
      ),
      m(
        "p",
        "It supports connecting a Mastodon account to display articles alongside your RSS/Atom feeds."
      ),
      m(
        "p",
        "The app allows you to listen to audio and watch videos directly if the feed provides the necessary URLs."
      ),
      m(
        "p",
        "The list of subscribed websites and podcasts is managed either locally or via an OPML file from an external source, such as a public link in the cloud."
      ),
      m("p", "For non-KaiOS users, local files must be uploaded to the app."),
      m("h4", { style: "margin-top:20px; margin-bottom:10px;" }, "Navigation:"),
      m("ul", [
        m(
          "li",
          m.trust(
            "Use the <strong>up</strong> and <strong>down</strong> arrow keys to navigate between articles.<br><br>"
          )
        ),
        m(
          "li",
          m.trust(
            "Use the <strong>left</strong> and <strong>right</strong> arrow keys to switch between categories.<br><br>"
          )
        ),
        m(
          "li",
          m.trust(
            "Press <strong>Enter</strong> to view the content of an article.<br><br>"
          )
        ),
        m(
          "li",
          {
            oncreate: (vnode) => {
              if (!status.notKaiOS) vnode.dom.style.display = "none";
            },
          },
          m.trust("Use <strong>Alt</strong> to access various options.")
        ),

        m(
          "li",
          {
            oncreate: (vnode) => {
              if (status.notKaiOS) vnode.dom.style.display = "none";
            },
          },
          m.trust("Use <strong>#</strong> Volume")
        ),

        m(
          "li",
          {
            oncreate: (vnode) => {
              if (status.notKaiOS) vnode.dom.style.display = "none";
            },
          },
          m.trust("Use <strong>*</strong> Audioplayer<br><br>")
        ),

        m("li", "Version: " + status.version),
      ])
    );
  },
};

var privacy_policy = {
  view: function () {
    return m("div", { id: "privacy_policy", class: "page" }, [
      m("h1", "Privacy Policy for Feedolin"),
      m(
        "p",
        "Feedolin is committed to protecting your privacy. This policy explains how data is handled within the app."
      ),

      m("h2", "Data Storage and Collection"),
      m("p", [
        "All data related to your RSS/Atom feeds and Mastodon account is stored ",
        m("strong", "locally"),
        " in your device’s browser. Feedolin does ",
        m("strong", "not"),
        " collect or store any data on external servers. The following information is stored locally:",
      ]),
      m("ul", [
        m("li", "Your subscribed RSS/Atom feeds and podcasts."),
        m("li", "OPML files you upload or manage."),
        m("li", "Your Mastodon account information and related data."),
      ]),
      m("p", "No server-side data storage or collection is performed."),

      m("h2", "KaiOS Users"),
      m("p", [
        "If you are using Feedolin on a KaiOS device, the app uses ",
        m("strong", "KaiOS Ads"),
        ", which may collect data related to your usage. The data collected by KaiOS Ads is subject to the ",
        m(
          "a",
          {
            href: "https://www.kaiostech.com/privacy-policy/",
            target: "_blank",
            rel: "noopener noreferrer",
          },
          "KaiOS privacy policy"
        ),
        ".",
      ]),
      m("p", [
        "For users on all other platforms, ",
        m("strong", "no ads"),
        " are used, and no external data collection occurs.",
      ]),

      m("h2", "External Sources Responsibility"),
      m("p", [
        "Feedolin enables you to add feeds and connect to external sources such as RSS/Atom feeds, podcasts, and Mastodon accounts. You are ",
        m("strong", "solely responsible"),
        " for the sources you choose to trust and subscribe to. Feedolin does not verify or control the content or data provided by these external sources.",
      ]),

      m("h2", "Third-Party Services"),
      m(
        "p",
        "Feedolin integrates with third-party services such as Mastodon. These services have their own privacy policies, and you should review them to understand how your data is handled."
      ),

      m("h2", "Policy Updates"),
      m(
        "p",
        "This Privacy Policy may be updated periodically. Any changes will be communicated through updates to the app."
      ),

      m(
        "p",
        "By using Feedolin, you acknowledge and agree to this Privacy Policy."
      ),
    ]);
  },
};

var settingsView = {
  view: function () {
    return m(
      "div",
      {
        class: "flex justify-content-center page",
        id: "settings-page",
        oncreate: () => {
          if (!status.notKaiOS) {
            status.local_opml = [];
            let cbb = (data) => {
              status.local_opml.push(data);
            };
            list_files("opml", cbb);
          }
          bottom_bar("", "<img src='assets/icons/select.svg'>", "");
          if (status.notKaiOS) bottom_bar("", "", "");

          document.querySelectorAll(".item").forEach((e, k) => {
            e.setAttribute("tabindex", k);
          });

          if (status.notKaiOS)
            top_bar("", "", "<img src='assets/icons/back.svg'>");
          if (status.notKaiOS) bottom_bar("", "", "");
        },
      },
      [
        m(
          "div",
          {
            class: "item input-parent  flex",
          },
          [
            m(
              "label",
              {
                for: "url-opml",
              },
              "OPML"
            ),
            m("input", {
              id: "url-opml",
              placeholder: "",
              value: settings.opml_url || "",
              type: "url",
            }),
          ]
        ),
        m(
          "button",
          {
            class: "item",
            onclick: () => {
              if (!settings.opml_local_filename) {
                let cb = (data) => {
                  const reader = new FileReader();

                  reader.onload = () => {
                    const downloadListData = generateDownloadList(
                      reader.result
                    );
                    if (downloadListData.error) {
                      side_toaster("OPML file not valid", 4000);
                    } else {
                      settings.opml_local = reader.result;
                      settings.opml_local_filename = data.filename;
                      localforage.setItem("settings", settings).then(() => {
                        side_toaster("OPML file added", 4000);
                      });
                    }
                  };

                  reader.onerror = () => {
                    side_toaster("OPML file not valid", 4000);
                  };

                  reader.readAsText(data.blob);
                };
                if (status.notKaiOS) {
                  pick_file(cb);
                } else {
                  status.local_opml.length > 0
                    ? m.route.set("/localOPML")
                    : side_toaster("not enough", 3000);
                }
              } else {
                settings.opml_local = "";
                settings.opml_local_filename = "";

                localforage.setItem("settings", settings).then(() => {
                  side_toaster("OPML file removed", 4000);
                  m.redraw();
                });
              }
            },
          },
          !settings.opml_local_filename
            ? "Upload OPML file"
            : "Remove OPML file"
        ),

        m("div", settings.opml_local_filename),

        m("div", { class: "seperation" }),
        m(
          "div",
          {
            class: "item input-parent flex ",
          },
          [
            m(
              "label",
              {
                for: "url-proxy",
              },
              "PROXY"
            ),
            m("input", {
              id: "url-proxy",
              placeholder: "",
              value: settings.proxy_url || "",
              type: "url",
            }),
          ]
        ),
        m("div", { class: "seperation" }),

        m(
          "h2",
          { class: "flex justify-content-spacearound" },
          "Mastodon Account"
        ),

        status.mastodon_logged
          ? m(
              "div",
              {
                id: "account_info",
                class: "item",
              },
              `You have successfully logged in as ${status.mastodon_logged} and the data is being loaded from server ${settings.mastodon_server_url}.`
            )
          : null,

        status.mastodon_logged
          ? m(
              "button",
              {
                class: "item",
                onclick: function () {
                  settings.mastodon_server_url = "";
                  settings.mastodon_token = "";
                  localforage.setItem("settings", settings);
                  status.mastodon_logged = "";
                  m.route.set("/settingsView");
                },
              },
              "Disconnect"
            )
          : null,

        status.mastodon_logged
          ? null
          : m(
              "div",
              {
                class: "item input-parent flex justify-content-spacearound",
              },
              [
                m(
                  "label",
                  {
                    for: "mastodon-server-url",
                  },
                  "URL"
                ),
                m("input", {
                  id: "mastodon-server-url",
                  placeholder: "Server URL",
                  value: settings.mastodon_server_url,
                }),
              ]
            ),

        status.mastodon_logged
          ? null
          : m(
              "button",
              {
                class: "item",
                onclick: function () {
                  localforage.setItem("settings", settings);

                  settings.mastodon_server_url = document.getElementById(
                    "mastodon-server-url"
                  ).value;

                  let url =
                    settings.mastodon_server_url +
                    "/oauth/authorize?client_id=" +
                    process.env.clientId +
                    "&scope=read&redirect_uri=" +
                    process.env.redirect +
                    "&response_type=code";
                  window.open(url);
                },
              },
              "Connect"
            ),

        m("div", { class: "seperation" }),
        m(
          "div",
          {
            class: "item input-parent flex ",
          },
          [
            m(
              "label",
              {
                for: "sleep-timer",
              },
              "Sleep timer in minutes"
            ),
            m("input", {
              id: "sleep-timer",
              placeholder: "",
              value: settings.sleepTimer,
              type: "tel",
            }),
          ]
        ),

        m(
          "button",
          {
            class: "item",
            id: "button-save-settings",
            onclick: function () {
              if (!validate_url(document.getElementById("url-opml").value))
                side_toaster("URL not valid");
              settings.opml_url = document.getElementById("url-opml").value;
              settings.proxy_url = document.getElementById("url-proxy").value;
              let sleepTimerInput =
                document.getElementById("sleep-timer").value;
              if (
                sleepTimerInput &&
                !isNaN(sleepTimerInput) &&
                Number(sleepTimerInput) > 0
              ) {
                settings.sleepTimer = parseInt(sleepTimerInput, 10);
              } else {
                settings.sleepTimer = ""; // Or leave it undefined if that's preferred
              }

              status.mastodon_logged
                ? null
                : (settings.mastodon_server_url = document.getElementById(
                    "mastodon-server-url"
                  ).value);

              localforage
                .setItem("settings", settings)
                .then(function (value) {
                  // Do other things once the value has been saved.
                  side_toaster("settings saved", 2000);
                })
                .catch(function (err) {
                  // This code runs if there were any errors
                  console.log(err);
                });
            },
          },
          "save settings"
        ),
      ]
    );
  },
};

m.route(root, "/intro", {
  "/article": article,
  "/detail": detail,
  "/mapView": mapView,
  "/settingsView": settingsView,
  "/intro": intro,
  "/start": start,
  "/options": options,
  "/about": about,
  "/privacy_policy": privacy_policy,
});

function scrollToCenter() {
  const activeElement = document.activeElement;
  if (!activeElement) return;

  const rect = activeElement.getBoundingClientRect();
  let elY = rect.top + rect.height / 2;

  let scrollContainer = activeElement.parentNode;

  // Find the first scrollable parent
  while (scrollContainer) {
    if (
      scrollContainer.scrollHeight > scrollContainer.clientHeight ||
      scrollContainer.scrollWidth > scrollContainer.clientWidth
    ) {
      // Calculate the element's offset relative to the scrollable parent
      const containerRect = scrollContainer.getBoundingClientRect();
      elY = rect.top - containerRect.top + rect.height / 2;
      break;
    }
    scrollContainer = scrollContainer.parentNode;
  }

  if (scrollContainer) {
    scrollContainer.scrollBy({
      left: 0,
      top: elY - scrollContainer.clientHeight / 2,
      behavior: "smooth",
    });
  } else {
    // If no scrollable parent is found, scroll the document body
    document.body.scrollBy({
      left: 0,
      top: elY - window.innerHeight / 2,
      behavior: "smooth",
    });
  }
}

let scrollToTop = () => {
  document.body.scrollTo({
    left: 0,
    top: 0,
    behavior: "smooth",
  });

  document.documentElement.scrollTo({
    left: 0,
    top: 0,
    behavior: "smooth",
  });
};

document.addEventListener("DOMContentLoaded", function (e) {
  /////////////////
  ///NAVIGATION
  /////////////////

  let nav = function (move) {
    if (
      document.activeElement.nodeName == "SELECT" ||
      document.activeElement.type == "date" ||
      document.activeElement.type == "time" ||
      status.window_status == "volume"
    )
      return false;

    if (document.activeElement.classList.contains("scroll")) {
      const scrollableElement = document.querySelector(".scroll");
      if (move == 1) {
        scrollableElement.scrollBy({ left: 0, top: 10 });
      } else {
        scrollableElement.scrollBy({ left: 0, top: -10 });
      }
    }

    const currentIndex = document.activeElement.tabIndex;
    let next = currentIndex + move;
    let items = 0;

    items = document.getElementById("app").querySelectorAll(".item");

    console.log(items);

    if (document.activeElement.parentNode.classList.contains("input-parent")) {
      document.activeElement.parentNode.focus();
      return true;
    }

    let targetElement = 0;

    if (next <= items.length) {
      targetElement = items[next];
      targetElement.focus();
    }

    if (next >= items.length) {
      targetElement = items[0];
      targetElement.focus();
    }

    scrollToCenter();
  };

  //detect swiping to fire animation

  let swiper = () => {
    let startX = 0;
    let maxSwipeDistance = 300; // Maximum swipe distance for full fade-out

    document.addEventListener(
      "touchstart",
      function (e) {
        startX = e.touches[0].pageX;
        document.querySelector("body").style.opacity = 1; // Start with full opacity
      },
      false
    );

    document.addEventListener(
      "touchmove",
      function (e) {
        let diffX = Math.abs(e.touches[0].pageX - startX);

        // Calculate the inverted opacity based on swipe distance
        let opacity = 1 - Math.min(diffX / maxSwipeDistance, 1);

        // Apply opacity to the body (or any other element)
        document.querySelector("body").style.opacity = opacity;
      },
      false
    );

    document.addEventListener(
      "touchend",
      function (e) {
        // Reset opacity to 1 when the swipe ends
        document.querySelector("body").style.opacity = 1;
      },
      false
    );
  };

  swiper();

  // Add click listeners to simulate key events
  document
    .querySelector("div.button-left")
    .addEventListener("click", function (event) {
      simulateKeyPress("SoftLeft");
    });

  document
    .querySelector("div.button-right")
    .addEventListener("click", function (event) {
      simulateKeyPress("SoftRight");
    });

  document
    .querySelector("div.button-center")
    .addEventListener("click", function (event) {
      simulateKeyPress("Enter");
    });

  //top bar

  document
    .querySelector("#top-bar div div.button-right")
    .addEventListener("click", function (event) {
      simulateKeyPress("Backspace");
    });

  document
    .querySelector("#top-bar div div.button-left")
    .addEventListener("click", function (event) {
      simulateKeyPress("*");
    });

  // Function to simulate key press events
  function simulateKeyPress(k) {
    shortpress_action({ key: k });
  }

  let isKeyDownHandled = false;

  document.addEventListener("keydown", function (event) {
    if (!isKeyDownHandled) {
      handleKeyDown(event); // Your keydown handler

      isKeyDownHandled = true;

      // Reset the flag after some time if needed, or based on your conditions
      setTimeout(() => {
        isKeyDownHandled = false;
      }, 300); // Optional timeout to reset the flag after a short delay
    }
  });

  let isKeyUpHandled = false;

  document.addEventListener("keyup", function (event) {
    if (!isKeyUpHandled) {
      handleKeyUp(event); // Your keydown handler

      isKeyUpHandled = true;

      // Reset the flag after some time if needed, or based on your conditions
      setTimeout(() => {
        isKeyUpHandled = false;
      }, 300); // Optional timeout to reset the flag after a short delay
    }
  });

  document.addEventListener("swiped", function (e) {
    let r = m.route.get();

    let dir = e.detail.dir;

    if (dir == "down") {
      if (window.scrollY === 0 || document.documentElement.scrollTop === 0) {
        // Page is at the top
        const swipeDistance = e.detail.yEnd - e.detail.yStart;

        if (swipeDistance > 300) {
          // reload_data();
        }
      }
    }
    if (dir == "right") {
      if (r.startsWith("/start")) {
      }
    }
    if (dir == "left") {
      if (r.startsWith("/start")) {
      }
    }
  });

  // ////////////////////////////
  // //KEYPAD HANDLER////////////
  // ////////////////////////////

  let longpress = false;
  const longpress_timespan = 2000;
  let timeout;

  function repeat_action(param) {
    switch (param.key) {
    }
  }

  //////////////
  ////LONGPRESS
  /////////////

  function longpress_action(param) {
    switch (param.key) {
      case "Backspace":
        window.close();
        break;
    }
  }

  // /////////////
  // //SHORTPRESS
  // ////////////

  function shortpress_action(param) {
    let r = m.route.get();

    switch (param.key) {
      case "ArrowRight":
        if (r.startsWith("/start")) {
        }

        break;

      case "ArrowLeft":
        if (r.startsWith("/start")) {
        }
        break;
      case "ArrowUp":
        nav(-1);

        break;
      case "ArrowDown":
        nav(+1);

        break;

      case "SoftRight":
      case "Alt":
        if (r.startsWith("/start")) {
          m.route.set("/options");
        }

        if (r.startsWith("/map")) {
          ZoomMap("in");
        }
        break;

      case "SoftLeft":
      case "Control":
        if (r.startsWith("/map")) {
          ZoomMap("out");
        }

        if (r.startsWith("/start")) {
          m.route.set("/mapView", {
            lat: articles[0].metadata.lat,
            lng: articles[0].metadata.lng,
          });
        }

        if (r.startsWith("/article")) {
          m.route.set("/mapView", {
            lat: current_article.metadata.lat,
            lng: current_article.metadata.lng,
          });
        }

        break;

      case "Enter":
        if (document.activeElement.classList.contains("input-parent")) {
          document.activeElement.children[0].focus();
        }
        break;

      case "#":
        break;

      case "Backspace":
        if (r.startsWith("/mapView")) {
          history.back();
        }

        if (r.startsWith("/article")) {
          history.back();
        }

        if (r.startsWith("/detail")) {
          history.back();
        }

        if (r.startsWith("/options")) {
          history.back();
        }

        break;
    }
  }

  // ///////////////////////////////
  // //shortpress / longpress logic
  // //////////////////////////////

  function handleKeyDown(evt) {
    if (evt.key == "Backspace" && document.activeElement.tagName != "INPUT") {
      evt.preventDefault();
    }

    if (evt.key === "EndCall") {
      evt.preventDefault();
      window.close();
    }
    if (!evt.repeat) {
      longpress = false;
      timeout = setTimeout(() => {
        longpress = true;
        longpress_action(evt);
      }, longpress_timespan);
    }

    if (evt.repeat) {
      if (evt.key == "Backspace") evt.preventDefault();

      if (evt.key == "Backspace") longpress = false;

      repeat_action(evt);
    }
  }

  function handleKeyUp(evt) {
    if (evt.key == "Backspace") evt.preventDefault();

    if (status.visibility === false) return false;

    clearTimeout(timeout);
    if (!longpress) {
      shortpress_action(evt);
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      status.visibility = true;
    } else {
      status.visibility = false;
    }
  });
});

window.addEventListener("online", () => {
  status.deviceOnline = true;
});
window.addEventListener("offline", () => {
  status.deviceOnline = false;
});

//webActivity KaiOS 3

try {
  navigator.serviceWorker
    .register(new URL("sw.js", import.meta.url), {
      type: "module",
    })
    .then((registration) => {
      console.log("Service Worker registered successfully.");

      // Check if a service worker is waiting to be activated
      if (registration.waiting) {
        console.log("A waiting Service Worker is already in place.");
        registration.update();
      }

      if ("b2g" in navigator) {
        // Subscribe to system messages if available
        if (registration.systemMessageManager) {
          registration.systemMessageManager.subscribe("activity").then(
            () => {
              console.log("Subscribed to general activity.");
            },
            (error) => {
              alert("Error subscribing to activity:", error);
            }
          );
        } else {
          alert("systemMessageManager is not available.");
        }
      }
    })
    .catch((error) => {
      alert("Service Worker registration failed:", error);
    });
} catch (e) {
  console.error("Error during Service Worker setup:", e);
}

//KaiOS3 handel mastodon oauth
sw_channel.addEventListener("message", (event) => {
  let result = event.data.oauth_success;

  if (result) {
    var myHeaders = new Headers();
    myHeaders.append("Content-Type", "application/x-www-form-urlencoded");

    var urlencoded = new URLSearchParams();
    urlencoded.append("code", result);
    urlencoded.append("scope", "read");

    urlencoded.append("grant_type", "authorization_code");
    urlencoded.append("redirect_uri", process.env.redirect);
    urlencoded.append("client_id", process.env.clientId);
    urlencoded.append("client_secret", process.env.clientSecret);

    var requestOptions = {
      method: "POST",
      headers: myHeaders,
      body: urlencoded,
      redirect: "follow",
    };

    fetch(settings.mastodon_server_url + "/oauth/token", requestOptions)
      .then((response) => response.json()) // Parse the JSON once
      .then((data) => {
        settings.mastodon_token = data.access_token; // Access the token
        localforage.setItem("settings", settings);
        m.route.set("/start?index=0");

        side_toaster("Successfully connected", 10000);
      })
      .catch((error) => {
        console.error("Error:", error);
        side_toaster("Connection failed");
      });
  }
});
