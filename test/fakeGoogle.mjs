// A tiny in-memory stand-in for Google (token endpoint + Sheets API) with several tabs,
// so the Members tab and the monthly record tabs can be tested together.
import assert from 'node:assert/strict';
import { createSheetStore } from '../api/_lib/sheets.js';

export function makeFakeGoogle(config, { rows = [], hasTab = true, months = {}, today = '2026-11-22' } = {}) {
  const tabs = new Map(); // title -> rows (arrays of cell values)
  const ids = new Map(); // title -> numeric sheetId
  let nextId = 7;
  const addTab = (title, initial = []) => {
    tabs.set(title, initial.map((r) => [...r]));
    ids.set(title, nextId++);
  };
  if (hasTab) addTab('Members', rows);
  for (const [title, monthRows] of Object.entries(months)) addTab(title, monthRows);

  const state = {
    tabs,
    calls: [],
    get rows() { return tabs.get('Members'); },
    get hasTab() { return tabs.has('Members'); },
    month: (title) => tabs.get(title),
  };

  const parseRange = (encoded) => {
    const m = /^'?(.*?)'?!(.*)$/.exec(decodeURIComponent(encoded));
    return { title: m[1], cells: m[2] };
  };

  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
    const path = u.replace(`https://sheets.googleapis.com/v4/spreadsheets/${config.sheetId}`, '');
    state.calls.push(`${init.method || 'GET'} ${decodeURIComponent(path)}`);
    if (u.startsWith('https://oauth2.googleapis.com/token')) {
      return reply({ access_token: 'tok', expires_in: 3600 });
    }
    assert.equal(init.headers.Authorization, 'Bearer tok');

    if (path.startsWith('?fields=')) {
      return reply({ sheets: [...tabs.keys()].map((title) => ({ properties: { sheetId: ids.get(title), title } })) });
    }

    if (path === ':batchUpdate') {
      const req = JSON.parse(init.body).requests[0];
      if (req.addSheet) {
        const { title } = req.addSheet.properties;
        if (tabs.has(title)) return reply({ error: { message: `A sheet with the name "${title}" already exists.` } }, 400);
        addTab(title);
        return reply({ replies: [{ addSheet: { properties: { sheetId: ids.get(title) } } }] });
      }
      if (req.deleteDimension) {
        const { sheetId, startIndex, endIndex } = req.deleteDimension.range;
        const title = [...ids].find(([, id]) => id === sheetId)[0];
        tabs.get(title).splice(startIndex, endIndex - startIndex);
        return reply({});
      }
    }

    if (path === '/values:batchUpdate') {
      for (const { range, values } of JSON.parse(init.body).data) {
        const { title, cells } = parseRange(encodeURIComponent(range));
        const n = Number(/^A(\d+):/.exec(cells)[1]);
        tabs.get(title)[n - 1] = values[0];
      }
      return reply({});
    }

    if (path.startsWith('/values:batchGet')) {
      const ranges = new URL(u).searchParams.getAll('ranges');
      return reply({
        valueRanges: ranges.map((r) => ({ values: structuredClone(tabs.get(parseRange(encodeURIComponent(r)).title) || []) })),
      });
    }

    if (path.startsWith('/values/')) {
      const [rangePart] = path.slice('/values/'.length).split('?');
      const isAppend = rangePart.endsWith(':append');
      const { title, cells } = parseRange(isAppend ? rangePart.slice(0, -':append'.length) : rangePart);
      if (!tabs.has(title)) return reply({ error: { message: `Unable to parse range: ${title}!${cells}` } }, 400);
      if (isAppend) {
        tabs.get(title).push(...JSON.parse(init.body).values);
        return reply({});
      }
      if (init.method === 'PUT') {
        const n = Number(/^A(\d+):/.exec(cells)[1]); // e.g. A3:J3
        tabs.get(title)[n - 1] = JSON.parse(init.body).values[0];
        return reply({});
      }
      return reply({ values: structuredClone(tabs.get(title)) }); // the real API sends a fresh copy
    }

    throw new Error(`unexpected request: ${u}`);
  };

  return { state, fetchImpl, store: createSheetStore(config, fetchImpl, { today: () => today }) };
}
