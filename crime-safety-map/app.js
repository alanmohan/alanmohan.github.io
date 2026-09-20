/*
 * AI assistance: OpenAI Codex helped generate the first implementation and its
 * error handling. The student remains responsible for testing and explaining it.
 */

(function () {
  "use strict";

  var form = document.getElementById("search-form");
  var input = document.getElementById("place-input");
  var mapElement = document.getElementById("map");
  var statusEl = document.getElementById("status");
  var titleEl = document.getElementById("results-title");
  var submitButton = form.querySelector('button[type="submit"]');
  var activityLayer = L.layerGroup();
  var hotspotLayer = L.layerGroup();
  var resizeFrame = null;

  var map = L.map(mapElement, { zoomControl: true, preferCanvas: false }).setView([54.5, -3.2], 5);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    crossOrigin: true,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);
  activityLayer.addTo(map);
  hotspotLayer.addTo(map);

  // Codex panels and mobile browsers can resize the map after Leaflet starts.
  // Re-measuring the container prevents offset or missing tile columns.
  if ("ResizeObserver" in window) {
    new ResizeObserver(function () {
      if (resizeFrame) cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(function () {
        map.invalidateSize({ pan: false });
      });
    }).observe(mapElement);
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    search(input.value);
  });

  document.querySelectorAll("[data-place]").forEach(function (button) {
    button.addEventListener("click", function () {
      input.value = button.dataset.place;
      search(button.dataset.place);
    });
  });

  function setStatus(message, state) {
    statusEl.textContent = message;
    statusEl.dataset.state = state || "normal";
  }

  function setLoading(loading) {
    submitButton.disabled = loading;
    submitButton.textContent = loading ? "Loading…" : "Explore area";
    form.setAttribute("aria-busy", String(loading));
  }

  async function search(rawPlace) {
    var place = rawPlace.trim();
    if (!place) {
      setStatus("Enter a city, town, neighbourhood, or postcode in England, Wales, or Northern Ireland.", "error");
      input.focus();
      return;
    }

    setLoading(true);
    setStatus("Finding “" + place + "” and requesting the latest incidents…");

    try {
      var location = await geocode(place);
      var crimeYear = await fetchCrimeYear(location.lat, location.lon);
      render(location, crimeYear);
      document.getElementById("results").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      setStatus(error.message || "The request failed. Please try another place.", "error");
    } finally {
      setLoading(false);
    }
  }

  async function geocode(place) {
    var results = await searchNominatim(place);
    if (!results.length) throw new Error("No covered location matched that search. Try a place in England, Wales, or Northern Ireland.");

    var labelledResult = results[0];
    var coordinateResult = labelledResult;

    // Nominatim may return the centroid of a city's administrative boundary.
    // Manchester's boundary centroid, for example, is several miles south of
    // the tourist centre. Refine only broad boundary results; exact postcodes,
    // streets, neighbourhoods, and explicit "city centre" searches stay exact.
    if (isBroadAdministrativeResult(labelledResult, place)) {
      // The public Nominatim service permits at most one request per second.
      // Space the optional refinement request so a deployed site stays within
      // that limit even when the first lookup returns immediately.
      await delay(1100);
      var centreResults = await searchNominatim(place + " city centre");
      if (centreResults.length) coordinateResult = centreResults[0];
    }

    if (coordinateResult.display_name.indexOf(", Scotland,") !== -1) {
      throw new Error("Scotland is not supported because this API only reports British Transport Police incidents there. Try a destination in England, Wales, or Northern Ireland.");
    }

    return {
      lat: Number(coordinateResult.lat),
      lon: Number(coordinateResult.lon),
      name: labelledResult.display_name.split(",").slice(0, 3).join(","),
      coverageWarning: isGreaterManchester(labelledResult)
        ? "Police.uk currently contains no Greater Manchester Police crime data. The incidents below come from other forces, such as British Transport Police, and are not representative of crime in Manchester."
        : ""
    };
  }

  function isGreaterManchester(result) {
    var address = result.address || {};
    return address.state_district === "Greater Manchester" ||
      /, Greater Manchester,/.test(result.display_name || "");
  }

  async function searchNominatim(place) {
    var url = new URL("https://nominatim.openstreetmap.org/search");
    url.search = new URLSearchParams({
      q: place,
      format: "jsonv2",
      countrycodes: "gb",
      addressdetails: "1",
      limit: "1"
    }).toString();

    var response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("The location search failed. Please try again shortly.");
    return response.json();
  }

  function isBroadAdministrativeResult(result, originalQuery) {
    var looksPrecise = /\d|\b(city centre|city center|centre|center|street|st\.?|road|rd\.?|avenue|ave\.?|lane|ln\.?|postcode)\b/i.test(originalQuery);
    // Nominatim's JSON has used both `class` and `category` for this field.
    // `type: administrative` is the important signal; checking either name
    // keeps the refinement working across API versions.
    var category = result.category || result.class;
    return !looksPrecise && result.type === "administrative" && category === "boundary";
  }

  async function fetchLatestMonth() {
    var response = await fetch("https://data.police.uk/api/crime-last-updated", {
      headers: { Accept: "application/json" }
    });
    if (!response.ok) throw new Error("The latest reporting date could not be loaded.");
    var data = await response.json();
    return data.date.slice(0, 7);
  }

  async function fetchCrimeMonth(lat, lon, month) {
    var url = new URL("https://data.police.uk/api/crimes-street/all-crime");
    url.search = new URLSearchParams({
      lat: lat.toFixed(6),
      lng: lon.toFixed(6),
      date: month
    }).toString();

    var response = await fetch(url.toString(), { headers: { Accept: "application/json" } });

    // One retry makes a year-long search more resilient to a brief API hiccup.
    if (response.status === 429 || response.status >= 500) {
      await delay(650);
      response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
    }

    if (response.status === 503) {
      throw new Error("Too many incidents were returned for " + month + ".");
    }
    if (!response.ok) throw new Error("The police-data request failed. Please try again shortly.");
    return response.json();
  }

  async function fetchCrimeYear(lat, lon) {
    var latestMonth = await fetchLatestMonth();
    var months = previousMonths(latestMonth, 12);
    var results = [];

    // Four requests at a time keeps well below the API's burst limit while
    // remaining much faster than twelve sequential requests.
    for (var start = 0; start < months.length; start += 4) {
      var batchMonths = months.slice(start, start + 4);
      setStatus(
        "Loading months " + (start + 1) + "–" + (start + batchMonths.length) +
        " of 12 for the annual view…"
      );

      var batch = await Promise.all(batchMonths.map(function (month) {
        return fetchCrimeMonth(lat, lon, month)
          .then(function (crimes) { return { month: month, crimes: crimes }; })
          .catch(function (error) { return { month: month, crimes: [], error: error }; });
      }));
      results = results.concat(batch);
    }

    var successful = results.filter(function (result) { return !result.error; });
    if (!successful.length) {
      throw new Error("No annual crime data could be loaded for that location. Please try again shortly.");
    }

    var crimes = successful.reduce(function (all, result) {
      return all.concat(result.crimes);
    }, []);

    return {
      crimes: deduplicateCrimes(crimes),
      requestedMonths: months,
      loadedMonths: successful.map(function (result) { return result.month; }),
      failedMonths: results.filter(function (result) { return result.error; }).map(function (result) { return result.month; })
    };
  }

  function render(location, crimeYear) {
    var crimes = crimeYear.crimes;
    titleEl.textContent = location.name;
    mapElement.dataset.searchCenter = location.lat.toFixed(6) + "," + location.lon.toFixed(6);
    map.setView([location.lat, location.lon], 13);

    activityLayer.clearLayers();
    hotspotLayer.clearLayers();

    if (!crimes.length) {
      resetStats();
      setStatus("No street-level incidents were returned for the available 12-month period.");
      return;
    }

    var validCrimes = crimes.filter(function (crime) {
      return crime.location && Number.isFinite(Number(crime.location.latitude)) && Number.isFinite(Number(crime.location.longitude));
    });

    var categories = countBy(validCrimes, function (crime) { return humanize(crime.category); });
    var locations = groupLocations(validCrimes);
    var sortedCategories = sortCounts(categories);
    var sortedLocations = Object.values(locations).sort(function (a, b) { return b.count - a.count; });
    var chronologicalMonths = crimeYear.loadedMonths.slice().sort();
    var period = chronologicalMonths.length
      ? formatMonth(chronologicalMonths[0]) + "–" + formatMonth(chronologicalMonths[chronologicalMonths.length - 1])
      : "Unknown";

    renderActivityMap(sortedLocations);

    document.getElementById("total-stat").textContent = validCrimes.length.toLocaleString();
    document.getElementById("category-stat").textContent = sortedCategories[0] ? sortedCategories[0][0] : "—";
    document.getElementById("location-stat").textContent = sortedLocations.length.toLocaleString();
    document.getElementById("month-stat").textContent = period;

    renderCategoryBars(sortedCategories, validCrimes.length);
    renderAreas(sortedLocations);
    requestAnimationFrame(function () { map.invalidateSize({ pan: false }); });
    var completeness = crimeYear.failedMonths.length
      ? " " + crimeYear.loadedMonths.length + " of 12 months loaded; unavailable: " + crimeYear.failedMonths.join(", ") + "."
      : " All 12 months loaded.";
    var summary = validCrimes.length.toLocaleString() + " anonymised incidents shown for " + period + "." +
      completeness + " The map covers roughly one mile around the selected point.";
    if (location.coverageWarning) {
      setStatus("Limited coverage: " + location.coverageWarning + " " + summary, "warning");
    } else {
      setStatus(summary);
    }
  }

  function previousMonths(latestMonth, count) {
    var parts = latestMonth.split("-").map(Number);
    var dates = [];
    for (var offset = 0; offset < count; offset += 1) {
      var date = new Date(Date.UTC(parts[0], parts[1] - 1 - offset, 1));
      dates.push(date.toISOString().slice(0, 7));
    }
    return dates;
  }

  function deduplicateCrimes(crimes) {
    var seen = new Set();
    return crimes.filter(function (crime) {
      var key = crime.month + ":" + (crime.persistent_id || crime.id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function delay(milliseconds) {
    return new Promise(function (resolve) { window.setTimeout(resolve, milliseconds); });
  }

  function countBy(items, keyFunction) {
    return items.reduce(function (counts, item) {
      var key = keyFunction(item);
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {});
  }

  function sortCounts(counts) {
    return Object.entries(counts).sort(function (a, b) { return b[1] - a[1]; });
  }

  function groupLocations(crimes) {
    return crimes.reduce(function (groups, crime) {
      var street = crime.location.street && crime.location.street.name ? crime.location.street.name : "Approximate location";
      if (!groups[street]) {
        groups[street] = {
          name: street,
          count: 0,
          lat: Number(crime.location.latitude),
          lon: Number(crime.location.longitude),
          categories: {}
        };
      }
      groups[street].count += 1;
      var category = humanize(crime.category);
      groups[street].categories[category] = (groups[street].categories[category] || 0) + 1;
      return groups;
    }, {});
  }

  function renderCategoryBars(categories, total) {
    var container = document.getElementById("category-bars");
    container.innerHTML = "";
    categories.slice(0, 8).forEach(function (entry) {
      var row = document.createElement("div");
      row.className = "bar";
      var percentage = Math.round((entry[1] / total) * 100);
      row.innerHTML =
        '<span class="bar__label">' + escapeHtml(entry[0]) + '</span>' +
        '<span class="bar__track"><span class="bar__fill" style="width:' + Math.max(percentage, 2) + '%"></span></span>' +
        '<span class="bar__count">' + entry[1] + '</span>';
      container.appendChild(row);
    });
  }

  function renderAreas(locations) {
    var list = document.getElementById("area-list");
    list.innerHTML = "";

    locations.slice(0, 7).forEach(function (location) {
      var topCategory = sortCounts(location.categories)[0];
      var item = document.createElement("li");
      item.innerHTML =
        '<span><span class="area-name">' + escapeHtml(location.name) + '</span>' +
        '<span class="area-note">Mostly ' + escapeHtml(topCategory ? topCategory[0].toLowerCase() : "reported incidents") + '</span></span>' +
        '<span class="area-count">' + location.count + ' reports</span>';
      list.appendChild(item);

      L.circleMarker([location.lat, location.lon], {
        radius: 6 + Math.min(location.count / 4, 7),
        color: "#8f203c",
        weight: 2,
        fillColor: "#ef6f4d",
        fillOpacity: 0.72
      }).bindPopup("<strong>" + escapeHtml(location.name) + "</strong><br>" + location.count + " reports at this anonymised map point").addTo(hotspotLayer);
    });
  }

  function renderActivityMap(locations) {
    if (!locations.length) return;

    var maximum = locations[0].count;
    var bounds = [];

    locations.forEach(function (location) {
      var ratio = location.count / maximum;
      var topCategory = sortCounts(location.categories)[0];
      var radius = 5 + Math.sqrt(ratio) * 22;

      L.circleMarker([location.lat, location.lon], {
        radius: radius,
        stroke: false,
        fillColor: activityColor(ratio),
        fillOpacity: 0.52,
        interactive: true
      }).bindPopup(
        "<strong>" + escapeHtml(location.name) + "</strong><br>" +
        location.count + " reports<br>Mostly " +
        escapeHtml(topCategory ? topCategory[0].toLowerCase() : "reported incidents")
      ).addTo(activityLayer);

      bounds.push([location.lat, location.lon]);
    });

    map.fitBounds(bounds, { padding: [28, 28], maxZoom: 14 });
  }

  function activityColor(ratio) {
    if (ratio >= 0.55) return "#9d1d3f";
    if (ratio >= 0.22) return "#df4f3d";
    if (ratio >= 0.09) return "#ef8b45";
    if (ratio >= 0.035) return "#e5ca43";
    return "#32a785";
  }

  function resetStats() {
    ["total-stat", "category-stat", "location-stat", "month-stat"].forEach(function (id) {
      document.getElementById(id).textContent = "—";
    });
    document.getElementById("category-bars").innerHTML = '<p class="empty-state">No category data was returned.</p>';
    document.getElementById("area-list").innerHTML = '<li class="empty-state">No approximate locations were returned.</li>';
  }

  function humanize(value) {
    if (!value) return "Unknown";
    return value.split("-").map(function (word) {
      return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(" ");
  }

  function formatMonth(value) {
    if (!value || !/^\d{4}-\d{2}$/.test(value)) return "Unknown";
    return new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" }).format(new Date(value + "-01T12:00:00Z"));
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character];
    });
  }
})();
