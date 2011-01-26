// Licensed under the Apache License, Version 2.0 (the "License"); you may not
// use this file except in compliance with the License. You may obtain a copy of
// the License at
//
//   http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
// WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
// License for the specific language governing permissions and limitations under
// the License.

couchTests.spatial = function(debug) {
  var db = new CouchDB("test_suite_db", {"X-Couch-Full-Commit":"false"});
  db.deleteDb();
  db.createDb();

  if (debug) debugger;


  var designDoc = {
    _id:"_design/spatial",
    language: "javascript",
    views: {
      lib: {
        geo: "exports.type = 'Point';"
      }
    },
    spatial : {
      basicIndex : stringFun(function(doc) {
        emit({
          type: "Point",
          coordinates: [doc.loc[0], doc.loc[1]]
        }, doc.string);
      }),
      dontEmitAll : stringFun(function(doc) {
        if (doc._id>5) {
          emit({
            type: "Point",
            coordinates: [doc.loc[0], doc.loc[1]]
          }, doc.string);
        }
      }),
      emitNothing : stringFun(function(doc) {}),
      geoJsonGeoms : stringFun(function(doc) {
        if (doc._id.substr(0,3)=="geo") {
          emit(doc.geom, doc.string);
        }
      }),
      withCommonJs : stringFun(function(doc) {
        var lib = require('views/lib/geo');
        emit({
          type: lib.type,
          coordinates: [doc.loc[0], doc.loc[1]]
        }, doc.string);
      })
    }
  };

  T(db.save(designDoc).ok);


  function makeSpatialDocs(start, end, templateDoc) {
    var docs = makeDocs(start, end, templateDoc);
    for (var i=0; i<docs.length; i++) {
        docs[i].loc = [i-20+docs[i].integer, i+15+docs[i].integer];
    }
    return docs;
  }

  function extract_ids(str) {
    var json = JSON.parse(str);
    var res = [];
    for (var i in json.rows) {
      res.push(json.rows[i].id);
    }
    return res.sort();
  }

  var xhr;
  var url_pre = '/test_suite_db/_design/spatial/_spatial/';
  var docs = makeSpatialDocs(0, 10);
  db.bulkSave(docs);


  // bounding box tests

  var bbox = [-180, -90, 180, 90];
  xhr = CouchDB.request("GET", url_pre + "basicIndex?bbox=" + bbox.join(","));
  TEquals(['0','1','2','3','4','5','6','7','8','9'],
          extract_ids(xhr.responseText),
          "should return all geometries");

  bbox = [-20, 0, 0, 20];
  xhr = CouchDB.request("GET", url_pre + "basicIndex?bbox=" + bbox.join(","));
  TEquals(['0','1','2'], extract_ids(xhr.responseText),
          "should return a subset of the geometries");

  bbox = [0, 4, 180, 90];
  xhr = CouchDB.request("GET", url_pre + "basicIndex?bbox=" + bbox.join(","));
  TEquals("{\"rows\":[]}\n", xhr.responseText,
          "should return no geometries");

  bbox = [-18, 17, -14, 21];
  xhr = CouchDB.request("GET", url_pre + "basicIndex?bbox=" + bbox.join(","));
  TEquals(['1','2','3'], extract_ids(xhr.responseText),
          "should also return geometry at the bounds of the bbox");

  bbox = [-16, 19, -16, 19];
  xhr = CouchDB.request("GET", url_pre + "basicIndex?bbox=" + bbox.join(","));
  TEquals(['2'], extract_ids(xhr.responseText),
          "bbox collapsed to a point should return the geometries there");

  // count parameter tests

  bbox = [-180, -90, 180, 90];
  xhr = CouchDB.request("GET", url_pre + "basicIndex?bbox=" + bbox.join(",") +
                        "&count=true");
  TEquals('{"count":10}\n', xhr.responseText,
          "should return the count of all geometries");


  // stale tests

  xhr = CouchDB.request("GET", url_pre + "basicIndex?bbox=" + bbox.join(","));
  var lastUpdateSeq = JSON.parse(xhr.responseText).update_seq;

  // some geometries are based on the GeoJSON specification
  // http://geojson.org/geojson-spec.html (2010-08-17)
  var geoJsonDocs = [{"_id": "geoPoint", "geom": { "type": "Point", "coordinates": [100.0, 0.0] }},
    {"_id": "geoLineString", "geom": { "type": "LineString", "coordinates":[
      [100.0, 0.0], [101.0, 1.0]
    ]}},
    {"_id": "geoPolygon", "geom": { "type": "Polygon", "coordinates": [
      [ [100.0, 0.0], [101.0, 0.0], [100.0, 1.0], [100.0, 0.0] ]
    ]}},
    {"_id": "geoPolygonWithHole", "geom": { "type": "Polygon", "coordinates": [
      [ [100.0, 0.0], [101.0, 0.0], [100.0, 1.0], [100.0, 0.0] ],
      [ [100.2, 0.2], [100.6, 0.2], [100.2, 0.6], [100.2, 0.2] ]
    ]}},
    {"_id": "geoMultiPoint", "geom": { "type": "MultiPoint", "coordinates": [
      [100.0, 0.0], [101.0, 1.0]
    ]}},
    {"_id": "geoMultiLineString", "geom": { "type": "MultiLineString",
      "coordinates": [
      [ [100.0, 0.0], [101.0, 1.0] ],
      [ [102.0, 2.0], [103.0, 3.0] ]
      ]
    }},
    {"_id": "geoMultiPolygon", "geom": { "type": "MultiPolygon",
      "coordinates": [
      [[[102.0, 2.0], [103.0, 2.0], [103.0, 3.0], [102.0, 3.0], [102.0, 2.0]]],
      [
        [[100.0, 0.0], [101.0, 0.0], [101.0, 1.0], [100.0, 1.0], [100.0, 0.0]],
        [[100.2, 0.2], [100.8, 0.2], [100.8, 0.8], [100.2, 0.8], [100.2, 0.2]]
      ]
      ]
    }},
    {"_id": "geoGeometryCollection", "geom": { "type": "GeometryCollection",
      "geometries": [
        { "type": "Point", "coordinates": [100.0, 0.0] },
        { "type": "LineString", "coordinates": [ [101.0, 0.0], [102.0, 1.0] ]}
      ]
    }}
  ];
  db.bulkSave(geoJsonDocs);

  bbox = [100.0, 0.0, 100.0, 0.0];
  xhr = CouchDB.request("GET", url_pre + "geoJsonGeoms?bbox=" + bbox.join(","));
  TEquals(true, /geoPoint/.test(extract_ids(xhr.responseText)),
          "if bounding box calculation was correct, it should at least" +
          " return the geoPoint");

  bbox = [100.8, 0.8, 101.0, 1.0],
  xhr = CouchDB.request("GET", url_pre + "geoJsonGeoms?bbox=" + bbox.join(","));
  TEquals(true, /geoPolygon/.test(extract_ids(xhr.responseText)),
          "if bounding box calculation was correct, it should at least" +
          " return the geoPolygon");

  bbox = [100.8, 0.8, 101.0, 1.0],
  xhr = CouchDB.request("GET", url_pre + "geoJsonGeoms?bbox=" + bbox.join(","));
  TEquals(true, /geoPolygonWithHole/.test(extract_ids(xhr.responseText)),
          "if bounding box calculation was correct, it should at least" +
          " return the geoPolygonWithHole");

  bbox = [100.1, 0.8, 100.2, 1.5],
  xhr = CouchDB.request("GET", url_pre + "geoJsonGeoms?bbox=" + bbox.join(","));
  TEquals(true, /geoMultiPoint/.test(extract_ids(xhr.responseText)),
          "if bounding box calculation was correct, it should at least" +
          " return the geoMultiPoint");

  bbox = [101.2, 1.3, 101.6, 1.5];
  xhr = CouchDB.request("GET", url_pre + "geoJsonGeoms?bbox=" + bbox.join(","));
  TEquals(true, /geoMultiLineString/.test(extract_ids(xhr.responseText)),
          "if bounding box calculation was correct, it should at least" +
          " return the geoMultiLineString");

  bbox = [101.2, 2.3, 101.6, 3.5];
  xhr = CouchDB.request("GET", url_pre + "geoJsonGeoms?bbox=" + bbox.join(","));
  TEquals(true, /geoMultiPolygon/.test(extract_ids(xhr.responseText)),
          "if bounding box calculation was correct, it should at least" +
          " return the geoMultiPolygon");

  bbox = [102, 0, 102, 0];
  xhr = CouchDB.request("GET", url_pre + "geoJsonGeoms?bbox=" + bbox.join(","));
  TEquals(true, /geoGeometryCollection/.test(extract_ids(xhr.responseText)),
          "if bounding box calculation was correct, it should at least" +
          " return the geoGeometryCollection");

  // test if CommonJS modules can be imported
  bbox = [-180, -90, 180, 90];
  xhr = CouchDB.request("GET", url_pre + "withCommonJs?bbox=" + bbox.join(","));
  T(xhr.status == 200);
  TEquals(['0','1','2','3','4','5','6','7','8','9'],
          extract_ids(xhr.responseText),
          "should return all geometries (test with CommonJS)");


  // Test plane wrapping

  // Put one doc in every quadrant of the pole/dateline tests
  db.bulkSave([
    {_id: 'wrap1', loc: [-30, 50]},
    {_id: 'wrap2', loc: [-15, 50]},
    {_id: 'wrap3', loc: [10, 50]},
    {_id: 'wrap4', loc: [-30, 22]},
    {_id: 'wrap5', loc: [-15, 22]},
    {_id: 'wrap6', loc: [10, 22]},
    {_id: 'wrap7', loc: [-30, 5]},
    {_id: 'wrap8', loc: [-15, 5]},
    {_id: 'wrap9', loc: [10, 5]}
  ]);

  var planeBounds = [-180, -90, 180, 90];
  bbox = [-180, 28, 180, 17];
  xhr = CouchDB.request("GET", url_pre + "basicIndex?bbox=" + bbox.join(",") +
    "&plane_bounds=" + planeBounds.join(","));
  TEquals(
    ['0','1','7','8','9','wrap1','wrap2','wrap3','wrap7','wrap8','wrap9'],
    extract_ids(xhr.responseText), "bbox that spans the poles");

  bbox = [-10, -90, -20, 90];
  xhr = CouchDB.request("GET", url_pre + "basicIndex?bbox=" + bbox.join(",") +
    "&plane_bounds=" + planeBounds.join(","));
  TEquals(
    ['0','5','6','7','8','9','wrap1','wrap3','wrap4','wrap6','wrap7','wrap9'],
    extract_ids(xhr.responseText), "bbox that spans the date line");

  bbox = [-10, 28, -20, 17];
  xhr = CouchDB.request("GET", url_pre + "basicIndex?bbox=" + bbox.join(",") +
    "&plane_bounds=" + planeBounds.join(","));
  TEquals(['0','7','8','9','wrap1','wrap3','wrap7','wrap9'],
    extract_ids(xhr.responseText), "bbox that spans the date line and poles");

  // try plane bounds that are smaller than the bounding box
  planeBounds = [-20, -20, 20, 20];
  bbox = [-180, 28, 180, -28];
  xhr = CouchDB.request("GET", url_pre + "basicIndex?bbox=" + bbox.join(",") +
    "&plane_bounds=" + planeBounds.join(","));
  TEquals(
    [], extract_ids(xhr.responseText),
    "bbox that would span the poles, but is outside of the plane bounds");

  bbox = [28, -90, -28, 90];
  xhr = CouchDB.request("GET", url_pre + "basicIndex?bbox=" + bbox.join(",") +
    "&plane_bounds=" + planeBounds.join(","));
  TEquals(
    [], extract_ids(xhr.responseText),
    "bbox that would spans the date line, but is outside of the plane bounds");

  bbox = [28, 28, -28, -28];
  xhr = CouchDB.request("GET", url_pre + "basicIndex?bbox=" + bbox.join(",") +
    "&plane_bounds=" + planeBounds.join(","));
  TEquals([], extract_ids(xhr.responseText),
    "bbox that would span the date line and poles, but is outside of the" +
      "plane bounds");

  // try other plane bounds (but with bbox which is smaller)
  planeBounds = [-25, -25, 25, 25];
  bbox = [-25, 24, 25, 6];
  xhr = CouchDB.request("GET", url_pre + "basicIndex?bbox=" + bbox.join(",") +
    "&plane_bounds=" + planeBounds.join(","));
  TEquals(
    ['5', 'wrap8','wrap9'],
    extract_ids(xhr.responseText), "bbox that spans the poles");

  bbox = [11, -25, -10, 25];
  xhr = CouchDB.request("GET", url_pre + "basicIndex?bbox=" + bbox.join(",") +
    "&plane_bounds=" + planeBounds.join(","));
  TEquals(
    ['0','1','2','3','4','5','wrap5','wrap8'],
    extract_ids(xhr.responseText), "bbox that spans the date line");

  bbox = [11, 24, -10, 6];
  xhr = CouchDB.request("GET", url_pre + "basicIndex?bbox=" + bbox.join(",") +
    "&plane_bounds=" + planeBounds.join(","));
  TEquals(['5','wrap8'],
    extract_ids(xhr.responseText), "bbox that spans the date line and poles");

  // Try flipped bounding box without plane bounds
  bbox = [11, 24, -10, 6];
  xhr = CouchDB.request("GET", url_pre + "basicIndex?bbox=" + bbox.join(","));
  TEquals(400, xhr.status,
    "flipped bbox without plane bounds should return an error");
};
