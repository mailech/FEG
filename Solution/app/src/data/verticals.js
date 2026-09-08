/**
 * The full vertical list.
 *
 * `source` is load-bearing and shown in the UI. Five sports come from
 * EPS_Offers.csv with real competitions and real price counts; the rest are
 * catalogue entries modelled on the live PSK sidebar so the breadth is
 * representative. Nothing synthetic is presented as measured.
 *
 * Horse racing matters out of proportion to its size: at one resolution per
 * race it anchors the low end of the event-frequency axis, which is the
 * constrained dimension in LANTERN-ARCHITECTURE.md §3.4b. It is the sport that
 * makes the cross-category argument demonstrable rather than theoretical.
 */

import sportsbook from './sportsbook.json';

const measured = new Map(sportsbook.sports.map((s) => [s.name, s]));

/** eventFrequencySec — seconds between resolutions. The constrained axis. */
const CATALOGUE = [
  { key: 'Soccer',       hr: 'Nogomet',            icon: 'football',        freq: 5400,  tier: 1 },
  { key: 'Tennis',       hr: 'Tenis',              icon: 'tennisball',      freq: 300,   tier: 1 },
  { key: 'Basketball',   hr: 'Košarka',            icon: 'basketball',      freq: 720,   tier: 1 },
  { key: 'Ice Hockey',   hr: 'Hokej',              icon: 'snow',            freq: 1200,  tier: 2 },
  { key: 'MMA',          hr: 'Borilački sportovi', icon: 'fitness',         freq: 900,   tier: 2 },

  { key: 'Horse Racing', hr: 'Konjičke utrke',     icon: 'trail-sign',      freq: 1800,  tier: 1, horses: true },
  { key: 'Greyhounds',   hr: 'Hrtovi',             icon: 'paw',             freq: 900,   tier: 3 },

  { key: 'Handball',     hr: 'Rukomet',            icon: 'hand-left',       freq: 3600,  tier: 2 },
  { key: 'Volleyball',   hr: 'Odbojka',            icon: 'ellipse',         freq: 1500,  tier: 2 },
  { key: 'Table Tennis', hr: 'Stolni tenis',       icon: 'square',          freq: 180,   tier: 2 },
  { key: 'Darts',        hr: 'Pikado',             icon: 'locate',          freq: 240,   tier: 2 },
  { key: 'Snooker',      hr: 'Snooker',            icon: 'ellipse-outline', freq: 1500,  tier: 3 },
  { key: 'Baseball',     hr: 'Bejzbol',            icon: 'baseball',        freq: 10800, tier: 3 },
  { key: 'Am. Football', hr: 'Američki nogomet',   icon: 'american-football', freq: 10800, tier: 3 },
  { key: 'Boxing',       hr: 'Boks',               icon: 'hand-right',      freq: 1800,  tier: 3 },
  { key: 'Cycling',      hr: 'Biciklizam',         icon: 'bicycle',         freq: 14400, tier: 4 },
  { key: 'Formula 1',    hr: 'Formula 1',          icon: 'car-sport',       freq: 7200,  tier: 3 },
  { key: 'Golf',         hr: 'Golf',               icon: 'golf',            freq: 14400, tier: 4 },
  { key: 'Athletics',    hr: 'Atletika',           icon: 'walk',            freq: 3600,  tier: 4 },
  { key: 'Water Polo',   hr: 'Vaterpolo',          icon: 'water',           freq: 2400,  tier: 3 },
  { key: 'Ski Jumping',  hr: 'Skijaški skokovi',   icon: 'triangle',        freq: 600,   tier: 4 },
  { key: 'Futsal',       hr: 'Futsal',             icon: 'football-outline', freq: 2400, tier: 4 },
  { key: 'eSports',      hr: 'eSport',             icon: 'game-controller', freq: 1800,  tier: 2 },
  { key: 'Virtual',      hr: 'Virtualni sport',    icon: 'tv',              freq: 120,   tier: 2 },
];

export const VERTICALS = CATALOGUE.map((v) => {
  const m = measured.get(v.key);
  return {
    ...v,
    source: m ? 'measured' : 'catalogue',
    competitions: m ? m.tournamentCount : null,
    priceUpdates: m ? m.priceUpdates : null,
  };
});

export const MEASURED = VERTICALS.filter((v) => v.source === 'measured');

/**
 * Horse racing cards. Not in EPS_Offers, so these are constructed — real
 * Croatian and UK courses, plausible fields, labelled as such wherever shown.
 */
export const HORSE_CARDS = [
  {
    id: 'hr1', course: 'Sinj', hrCourse: 'Hipodrom Sinj', going: 'Dobra',
    time: '14:20', distance: '1600m', runners: 8, grade: 'Alka Handicap',
    field: [
      { no: 1, horse: 'Bura od Dinare', jockey: 'M. Vuković', form: '2-1-3', odds: 3.40, drift: -0.2 },
      { no: 2, horse: 'Zlatni Kaštel',  jockey: 'I. Perić',   form: '1-4-1', odds: 4.10, drift: +0.3 },
      { no: 3, horse: 'Sokol Vranski',  jockey: 'D. Matić',   form: '5-2-2', odds: 5.50, drift: 0 },
      { no: 4, horse: 'Adrijana',       jockey: 'K. Novak',   form: '3-3-6', odds: 7.00, drift: -0.5 },
      { no: 5, horse: 'Marun',          jockey: 'P. Babić',   form: '6-5-4', odds: 11.0, drift: +1.0 },
      { no: 6, horse: 'Velebit Vjetar', jockey: 'T. Jurić',   form: '4-7-2', odds: 13.0, drift: 0 },
      { no: 7, horse: 'Kornat',         jockey: 'S. Ivić',    form: '8-6-5', odds: 21.0, drift: +2.0 },
      { no: 8, horse: 'Dalmatinka',     jockey: 'L. Kovač',   form: '7-8-8', odds: 34.0, drift: +4.0 },
    ],
  },
  {
    id: 'hr2', course: 'Ascot', hrCourse: 'Ascot', going: 'Mekana',
    time: '15:05', distance: '2400m', runners: 6, grade: 'Group 3',
    field: [
      { no: 1, horse: 'Northern Quill', jockey: 'R. Moore',   form: '1-1-2', odds: 2.20, drift: -0.3 },
      { no: 2, horse: 'Copperfield',    jockey: 'W. Buick',   form: '2-3-1', odds: 3.75, drift: 0 },
      { no: 3, horse: 'Salt Marsh',     jockey: 'O. Murphy',  form: '3-2-4', odds: 6.50, drift: +0.5 },
      { no: 4, horse: 'Lauriston',      jockey: 'T. Marquand',form: '4-5-3', odds: 9.00, drift: 0 },
      { no: 5, horse: 'Ember Lane',     jockey: 'H. Doyle',   form: '6-4-5', odds: 15.0, drift: +2.0 },
      { no: 6, horse: 'Quiet Harbour',  jockey: 'J. Crowley', form: '5-6-7', odds: 26.0, drift: +3.0 },
    ],
  },
  {
    id: 'hr3', course: 'Ljubičevo', hrCourse: 'Ljubičevo', going: 'Tvrda',
    time: '16:40', distance: '1200m', runners: 7, grade: 'Sprint',
    field: [
      { no: 1, horse: 'Munja',          jockey: 'A. Simić',   form: '1-2-1', odds: 2.90, drift: -0.1 },
      { no: 2, horse: 'Panonski Vjetar',jockey: 'N. Ilić',    form: '3-1-2', odds: 4.50, drift: 0 },
      { no: 3, horse: 'Vidra',          jockey: 'B. Popović', form: '2-4-3', odds: 6.00, drift: +0.4 },
      { no: 4, horse: 'Slavonac',       jockey: 'M. Tomić',   form: '4-3-5', odds: 8.50, drift: 0 },
      { no: 5, horse: 'Zvijezda Save',  jockey: 'G. Lukić',   form: '5-6-4', odds: 12.0, drift: +1.5 },
      { no: 6, horse: 'Orkan',          jockey: 'V. Radić',   form: '7-5-6', odds: 19.0, drift: +2.0 },
      { no: 7, horse: 'Baranja',        jockey: 'Z. Horvat',  form: '6-7-8', odds: 29.0, drift: +5.0 },
    ],
  },
];

/** Markets offered on a race. Real racing market vocabulary. */
export const HORSE_MARKETS = [
  { key: 'win', label: 'Pobjednik', hint: 'Win — first past the post' },
  { key: 'place', label: 'Plasman', hint: 'Each-way place — top 3 in an 8+ runner field' },
  { key: 'forecast', label: 'Prognoza', hint: 'Forecast — first two in correct order' },
  { key: 'tricast', label: 'Tricast', hint: 'Tricast — first three in correct order' },
];
