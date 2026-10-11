import type { RideSession } from '../../src/types/ride';

const tinyPng = Cypress.Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64',
);

const installLocationStub = (win: Window) => {
  const position = {
    coords: {
      latitude: 14.6,
      longitude: 121,
      accuracy: 5,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: 5,
    },
    timestamp: Date.now(),
  } as GeolocationPosition;
  Object.defineProperty(win.navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition(success: (value: GeolocationPosition) => void) { success(position); },
      watchPosition(success: (value: GeolocationPosition) => void) { success(position); return 1; },
      clearWatch() {},
    },
  });
  Object.defineProperty(win.navigator, 'permissions', {
    configurable: true,
    value: { query: () => Promise.resolve({ state: 'granted' }) },
  });
};

const stubMapTiles = () => {
  [
    '**.tile.openstreetmap.org/**',
    '**.basemaps.cartocdn.com/**',
    '**.arcgisonline.com/**',
  ].forEach((url) => cy.intercept('GET', url, {
    statusCode: 200,
    headers: { 'content-type': 'image/png' },
    body: tinyPng,
  }));
};

const openRideDb = (win: Window) => new Promise<IDBDatabase>((resolve, reject) => {
  let attempts = 0;
  const open = () => {
    attempts += 1;
    const request = win.indexedDB.open('rideTrackerDb');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      if (['sessions', 'tracks', 'photos'].every((name) => db.objectStoreNames.contains(name))) {
        resolve(db);
        return;
      }
      db.close();
      if (attempts >= 30) {
        reject(new Error('RoadTrip IndexedDB schema did not become available'));
        return;
      }
      win.setTimeout(open, 100);
    };
  };
  open();
});

const seedSession = (rideId: string) => cy.window().then(async (win) => {
  const db = await openRideDb(win);
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(['sessions', 'tracks'], 'readwrite');
    transaction.objectStore('sessions').put({
      rideId,
      userId: `user-${rideId}`,
      userName: 'Lifecycle Rider',
      isHost: true,
      isSolo: true,
      createdAt: new Date().toISOString(),
      durationSeconds: 12,
      distanceMeters: 35,
      activeSegmentId: `segment-${rideId}-initial`,
      status: 'active',
    });
    transaction.objectStore('tracks').add({
      rideId,
      pointId: `point-${rideId}-initial`,
      segmentId: `segment-${rideId}-initial`,
      source: 'foreground',
      lat: 14.6,
      lng: 121,
      speed: 1,
      timestamp: new Date().toISOString(),
    });
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
  });
});

const readRideData = <T,>(rideId: string, read: (db: IDBDatabase) => IDBRequest<T>) =>
  cy.window().then((win) => new Promise<T>((resolve, reject) => {
    const request = win.indexedDB.open('rideTrackerDb');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const resultRequest = read(db);
      resultRequest.onsuccess = () => { const result = resultRequest.result; db.close(); resolve(result); };
      resultRequest.onerror = () => { db.close(); reject(resultRequest.error); };
    };
  }));

const readSession = (rideId: string): Cypress.Chainable<RideSession | undefined> => readRideData(rideId, (db) =>
  db.transaction('sessions', 'readonly').objectStore('sessions').get(rideId));

const readSessionUntil = (rideId: string, verify: (session: RideSession | undefined) => boolean, attempt = 0) =>
  readSession(rideId).then((session) => {
    if (verify(session)) return session;
    if (attempt >= 60) throw new Error(`Ride ${rideId} did not persist the expected lifecycle state`);
    return cy.wait(100).then(() => readSessionUntil(rideId, verify, attempt + 1));
  });

const readPhotos = (rideId: string) => readRideData(rideId, (db) =>
  db.transaction('photos', 'readonly').objectStore('photos').index('rideId').getAll(rideId));

const openSeededMap = (rideId: string) => {
  cy.visit('/home', { onBeforeLoad: installLocationStub });
  seedSession(rideId);
  cy.visit('/ride-map/' + rideId, { onBeforeLoad: installLocationStub });
  cy.get('.map-container').should('be.visible');
};

describe('live ride lifecycle', () => {
  beforeEach(() => {
    cy.viewport(390, 844);
    stubMapTiles();
  });

  it('pauses and resumes from the visible map action, persisting each lifecycle transition', () => {
    const rideId = `solo-cy-lifecycle-${Date.now()}`;
    openSeededMap(rideId);

    cy.get('[data-ride-action="pause-resume"]')
      .should('be.visible')
      .and('have.attr', 'aria-label', 'Pause ride tracking')
      .click();
    cy.get('[data-ride-action="pause-resume"]')
      .should('have.attr', 'aria-label', 'Resume ride tracking');
    readSessionUntil(rideId, (session) => session?.status === 'paused');

    cy.get('[data-ride-action="pause-resume"]')
      .should('be.visible')
      .and('have.attr', 'aria-label', 'Resume ride tracking')
      .click();
    cy.get('[data-ride-action="pause-resume"]')
      .should('have.attr', 'aria-label', 'Pause ride tracking');
    readSessionUntil(rideId, (session) =>
      session?.status === 'active' && session.activeSegmentId !== `segment-${rideId}-initial`)
      .then((session) => {
      expect(session.status).to.equal('active');
      expect(session.activeSegmentId).not.to.equal(`segment-${rideId}-initial`);
    });
  });

  it('cancels end confirmation without changing the ride, then confirms and persists the end', () => {
    const rideId = `solo-cy-end-confirm-${Date.now()}`;
    openSeededMap(rideId);

    cy.get('[data-ride-action="end"]').should('be.visible').click();
    cy.get('[role="alertdialog"]').should('be.visible');
    cy.get('[data-ride-end-cancel]').click();
    cy.get('[role="alertdialog"]').should('not.exist');
    cy.location('pathname').should('eq', `/ride-map/${rideId}`);
    readSession(rideId).should((session) => expect(session.status).to.equal('active'));

    cy.get('[data-ride-action="end"]').click();
    cy.get('[data-ride-end-confirm]').click();
    cy.location('pathname').should('eq', '/home');
    readSession(rideId).should((session) => {
      expect(session.status).to.equal('ended');
      expect(typeof session.endedAt).to.equal('string');
      expect(session.endedAt?.length).to.be.greaterThan(0);
      expect(session.distanceMeters).to.be.a('number');
      expect(session.durationSeconds).to.be.at.least(12);
    });
    cy.window().its('localStorage').invoke('getItem', `ride:hidden:${rideId}`).should('equal', '1');
  });

  it('keeps a failed photo save draft open and saves the caption on retry', () => {
    const rideId = 'solo-cy-photo-retry-' + Date.now();
    openSeededMap(rideId);
    cy.window().then((win) => {
      const storePrototype = win.IDBObjectStore.prototype;
      const originalAdd = storePrototype.add;
      let failFirstPhotoWrite = true;
      storePrototype.add = function (...args: Parameters<IDBObjectStore['add']>) {
        if (this.name === 'photos' && failFirstPhotoWrite) {
          failFirstPhotoWrite = false;
          throw new Error('Simulated photo storage failure');
        }
        return originalAdd.apply(this, args);
      };
    });

    cy.get('[aria-label="Add ride photo"]').click();
    cy.get('input[type="file"]').selectFile({
      contents: tinyPng,
      fileName: 'retry-photo.png',
      mimeType: 'image/png',
    }, { force: true });
    cy.get('[role="dialog"] input[placeholder="Add a note or caption"]').should('be.visible').type('Retry this memory');
    cy.contains('[role="dialog"] ion-button', 'Save photo').click();
    cy.get('[role="dialog"] [role="alert"]').should('contain.text', 'Your photo and caption are still here');
    cy.get('[role="dialog"] input[placeholder="Add a note or caption"]').should('have.value', 'Retry this memory');
    cy.contains('[role="dialog"] ion-button', 'Save photo').click();
    cy.get('[role="dialog"]').should('not.exist');
    readPhotos(rideId).should((photos) => {
      expect(photos).to.have.length(1);
      expect(photos[0].note).to.equal('Retry this memory');
    });
  });

  it('clears an unsaved photo caption after Escape dismissal before the next capture', () => {
    const rideId = 'solo-cy-photo-dismiss-' + Date.now();
    openSeededMap(rideId);

    cy.get('[aria-label="Add ride photo"]').click();
    cy.get('input[type="file"]').selectFile({
      contents: tinyPng,
      fileName: 'first-photo.png',
      mimeType: 'image/png',
    }, { force: true });
    cy.get('[role="dialog"] input[placeholder="Add a note or caption"]').should('be.visible').type('Old memory');
    cy.get('[role="dialog"] input[placeholder="Add a note or caption"]').type('{esc}');
    cy.get('[role="dialog"]').should('not.exist');

    cy.get('[aria-label="Add ride photo"]').click();
    cy.get('input[type="file"]').selectFile({
      contents: tinyPng,
      fileName: 'second-photo.png',
      mimeType: 'image/png',
    }, { force: true });
    cy.get('[role="dialog"] input[placeholder="Add a note or caption"]').should('be.visible').and('have.value', '');
    cy.contains('[role="dialog"] ion-button', 'Cancel').click();
  });
});
