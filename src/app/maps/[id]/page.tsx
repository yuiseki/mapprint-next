"use client";

import { useParams, useSearchParams } from "next/navigation";
import {
  Map,
  GeolocateControl,
  NavigationControl,
  useMap,
  LngLatBounds,
} from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";

import { getOverpassResponseJsonWithCache } from "@/utils/getOverpassResponse";

import styles from "./styles.module.scss";
import { useEffect, useState } from "react";
import osmtogeojson from "osmtogeojson";
import { Md5 } from "ts-md5";
import { FeatureCollection } from "geojson";
import { GeoJsonToSomethings } from "@/components/GeoJsonToSomethings";
// @ts-ignore
import * as turf from "@turf/turf";

const hospitalsQuery = `
[out:json][timeout:30000];
rel(4800240);
map_to_area->.a;
(
  nwr["amenity"="hospital"](area.a);
);
out geom;
`;

const hospitalsStyle = {
  color: "rgba(0, 0, 0, 1)",
  fillColor: "rgba(255, 0, 0, 1)",
  emoji: "🏥",
};

const schoolsQuery = `
[out:json][timeout:30000];
rel(4800240);
map_to_area->.a;
(
  nwr["amenity"="school"](area.a);
);
out geom;
`;

const schoolsStyle = {
  color: "rgba(0, 0, 0, 1)",
  fillColor: "rgba(0, 255, 0, 1)",
  emoji: "🏫",
};

const overpassQueryWithStyleList = [
  {
    query: hospitalsQuery,
    style: hospitalsStyle,
  },
  {
    query: schoolsQuery,
    style: schoolsStyle,
  },
];

type GeoJsonWithStyle = {
  id: string;
  style: {
    color?: string;
    fillColor?: string;
    emoji?: string;
  };
  geojson: FeatureCollection;
};

const Page = () => {
  const searchParams = useSearchParams();
  const { id } = useParams();
  const searchParamsString = searchParams.toString();
  const printMode = searchParamsString === "print=true";

  const [loaded, setLoaded] = useState(false);
  const [currentBounds, setCurrentBounds] = useState<LngLatBounds>();

  const [geoJsonWithStyleList, setGeoJsonWithStyleList] = useState<
    Array<GeoJsonWithStyle>
  >([]);

  const [geoJsonWithStyleListInMapBounds, setGeoJsonWithStyleListInMapBounds] =
    useState<Array<GeoJsonWithStyle>>([]);

  useEffect(() => {
    const thisEffect = async () => {
      setLoaded(true);
      for (const overpassQueryWithStyle of overpassQueryWithStyleList) {
        const overpassResJson = await getOverpassResponseJsonWithCache(
          overpassQueryWithStyle.query
        );
        const newGeojson = osmtogeojson(overpassResJson);
        const md5 = new Md5();
        md5.appendStr(overpassQueryWithStyle.query);
        const hash = md5.end();
        setGeoJsonWithStyleList((prev) => {
          if (prev.find((item) => item.id === hash)) return prev;
          return [
            ...prev,
            {
              id: hash as string,
              style: overpassQueryWithStyle.style || {},
              geojson: newGeojson,
            },
          ];
        });
      }
    };
    if (!loaded) {
      setLoaded(true);
      thisEffect();
    }
  }, [loaded, overpassQueryWithStyleList]);

  useEffect(() => {
    if (!geoJsonWithStyleList) return;
    if (!currentBounds) return;
    setGeoJsonWithStyleListInMapBounds(
      geoJsonWithStyleList.map((geoJsonWithStyle) => {
        // currentBounds is a LngLatBounds object
        // bbox extent in minX, minY, maxX, maxY order
        // convert currentBounds to bbox array
        const currentMapBbox = [
          currentBounds.getWest(),
          currentBounds.getSouth(),
          currentBounds.getEast(),
          currentBounds.getNorth(),
        ];
        const geojsonInMapBounds = geoJsonWithStyle.geojson.features.filter(
          (feature) => {
            // use turf.js to check if feature is in map bounds
            const poly = turf.bboxPolygon(currentMapBbox);
            const isInside = turf.booleanContains(poly, feature);
            return isInside;
          }
        );
        return {
          ...geoJsonWithStyle,
          geojson: {
            type: "FeatureCollection",
            features: geojsonInMapBounds,
          },
        };
      })
    );
  }, [geoJsonWithStyleList, currentBounds]);

  return (
    <div className={printMode ? styles.mapPrint : styles.mapWeb}>
      <h1>Maps: {id}</h1>
      <div className={styles.attributionWrap}>
        <p>© OpenMapTiles © OpenStreetMap contributors</p>
      </div>
      <div className={styles.mapWrap}>
        <Map
          initialViewState={{
            longitude: 137.1083671,
            latitude: 37.3294213,
            zoom: 9,
          }}
          hash={true}
          style={{ width: "100%", height: "100%" }}
          mapStyle="https://tile.openstreetmap.jp/styles/osm-bright-ja/style.json"
          attributionControl={false}
          onLoad={(e) => {
            setCurrentBounds(e.target.getBounds());
          }}
          onMove={(e) => {
            setCurrentBounds(e.target.getBounds());
          }}
        >
          {printMode !== true && (
            <>
              <GeolocateControl position="top-right" />
              <NavigationControl
                position="top-right"
                visualizePitch={true}
                showZoom={true}
                showCompass={true}
              />
            </>
          )}
          {geoJsonWithStyleListInMapBounds &&
            geoJsonWithStyleListInMapBounds.map((geoJsonWithStyle) => {
              return (
                <GeoJsonToSomethings
                  key={geoJsonWithStyle.id}
                  geojson={geoJsonWithStyle.geojson}
                  style={geoJsonWithStyle.style}
                />
              );
            })}
        </Map>
      </div>
      <div className={styles.markersWrap}>
        <ul
          style={{
            listStyle: "none",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
          }}
        >
          {geoJsonWithStyleListInMapBounds &&
            geoJsonWithStyleListInMapBounds.map((geoJsonWithStyle) => {
              const emoji = geoJsonWithStyle.style?.emoji;
              return geoJsonWithStyle.geojson.features.map((feature, index) => {
                const name = feature.properties?.name;
                if (!name) return null;
                return (
                  <li
                    key={name}
                    style={{
                      margin: "10px",
                    }}
                  >
                    <span
                      style={{
                        backgroundColor: geoJsonWithStyle.style?.fillColor,
                        color: geoJsonWithStyle.style?.color,
                        backdropFilter: "blur(4px)",
                        borderRadius: "4px",
                        padding: "2px 4px",
                        fontFamily: "sans-serif, emoji",
                        lineHeight: "1.1",
                        WebkitPrintColorAdjust: "exact",
                        marginRight: "8px",
                      }}
                    >
                      {emoji} {index + 1}
                    </span>
                    : <span>{name}</span>
                  </li>
                );
              });
            })}
        </ul>
      </div>
    </div>
  );
};

export default Page;
