const createRideFixture = (rideId: string) => cy.visit('/ride-history')
  .then(() => cy.contains('ion-title', 'Ride History').should('be.visible'))
  .then(() => cy.window().then((win) => new Cypress.Promise<void>((resolve, reject) => {
  const request = win.indexedDB.open('rideTrackerDb');
  request.onerror = () => reject(request.error);
  request.onsuccess = () => {
    const db = request.result;
    const requiredStores = ['sessions', 'tracks', 'photos'];
    const missingStore = requiredStores.find((store) => !db.objectStoreNames.contains(store));
    if (missingStore) {
      db.close();
      reject(new Error(`Ride database is missing the ${missingStore} store`));
      return;
    }

    const transaction = db.transaction(requiredStores, 'readwrite');
    const createdAt = new Date(Date.now() + 86_400_000).toISOString();
    requiredStores.forEach((store) => transaction.objectStore(store).clear());
    transaction.objectStore('sessions').put({
      rideId,
      userId: 'cypress-user',
      userName: 'Cypress Rider',
      isHost: true,
      isSolo: true,
      createdAt,
      endedAt: new Date(Date.parse(createdAt) + 2_400_000).toISOString(),
      status: 'ended',
      distanceMeters: 12500,
      durationSeconds: 2400,
    });
    const tracks = transaction.objectStore('tracks');
    [
      { lat: 14.6000, lng: 121.0000, timestamp: createdAt },
      { lat: 14.6050, lng: 121.0060, timestamp: new Date(Date.parse(createdAt) + 600_000).toISOString() },
      { lat: 14.6100, lng: 121.0120, timestamp: new Date(Date.parse(createdAt) + 1_200_000).toISOString() },
    ].forEach((point, index) => tracks.add({
      rideId,
      pointId: `${rideId}-point-${index}`,
      segmentId: `${rideId}-segment-1`,
      source: 'foreground',
      speed: 4 + index,
      ...point,
    }));
    const pixel = Uint8Array.from(win.atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pZsAAAAASUVORK5CYII='), (character) => character.charCodeAt(0));
    const image = new win.Blob([pixel], { type: 'image/png' });
    transaction.objectStore('photos').add({
      rideId,
      timestamp: new Date(Date.parse(createdAt) + 600_000).toISOString(),
      note: 'Cypress ride photo',
      data: image,
      thumb: image,
    });

    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
    transaction.onabort = () => { db.close(); reject(transaction.error); };
  };
})))

const readRideRecords = (rideId: string) => cy.window().then((win) => new Cypress.Promise<{ sessions: unknown[]; tracks: unknown[]; photos: unknown[] }>((resolve, reject) => {
  const request = win.indexedDB.open('rideTrackerDb');
  request.onerror = () => reject(request.error);
  request.onsuccess = () => {
    const db = request.result;
    const transaction = db.transaction(['sessions', 'tracks', 'photos'], 'readonly');
    const sessionsRequest = transaction.objectStore('sessions').getAll();
    const tracksRequest = transaction.objectStore('tracks').getAll();
    const photosRequest = transaction.objectStore('photos').getAll();
    transaction.oncomplete = () => {
      const belongsToRide = (record: unknown) => (record as { rideId?: string }).rideId === rideId;
      resolve({
        sessions: sessionsRequest.result.filter(belongsToRide),
        tracks: tracksRequest.result.filter(belongsToRide),
        photos: photosRequest.result.filter(belongsToRide),
      });
      db.close();
    };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
  };
}));

const historyRow = (rideId: string) => cy.get(`ion-item.history-card[data-ride-id="${rideId}"]`);

const openDeleteAction = (rideId: string) => historyRow(rideId).closest('ion-item-sliding').then(($sliding) => {
  const sliding = $sliding[0] as HTMLElement & { open: (side?: 'start' | 'end') => Promise<void> };
  return sliding.open('end');
});

const clickDeleteAction = (rideId: string) => historyRow(rideId)
  .closest('ion-item-sliding')
  .contains('ion-item-option', 'Delete ride')
  .click();

describe('ride history journey', () => {
  beforeEach(() => {
    cy.intercept('GET', 'https://*.tile.openstreetmap.org/**', { statusCode: 503, body: '' });
  });

  it('filters a saved ride, opens its summary, and starts replay', () => {
    const rideId = `solo-history-journey-${Date.now()}`;
    createRideFixture(rideId);
    cy.visit('/ride-history');

    cy.contains('ion-segment-button', 'Solo').click();
    historyRow(rideId).should('contain.text', 'Solo ride').click();
    cy.url().should('include', `/ride-history-stats/${rideId}`);
    cy.contains('h1', 'Ride complete').should('be.visible');
    cy.contains('button', 'Replay ride').click();
    cy.url().should('include', `/ride-replay/${rideId}`);
    cy.get('ion-title').should('contain.text', 'Replay');
    cy.get('ion-button[aria-label="Play replay"]').should('be.visible');
  });

  it('opens share creation from a saved ride summary', () => {
    const rideId = `solo-history-share-${Date.now()}`;
    createRideFixture(rideId);
    cy.visit('/ride-history');
    cy.contains('ion-segment-button', 'Solo').click();
    historyRow(rideId).should('contain.text', 'Solo ride').click();
    cy.url().should('include', `/ride-history-stats/${rideId}`);
    cy.contains('h1', 'Ride complete').should('be.visible');
    cy.contains('button', 'Create Share Image').click();
    cy.url().should('include', `/ride-history-stats/${rideId}/share`);
    cy.get('ion-title').should('contain.text', 'Create Share Image');
    cy.get('.share-page-scroll').scrollTo('bottom');
    cy.contains('button', 'Generate Image').should('be.visible');
  });

  it('keeps the ride and its records when delete is cancelled, then deletes after confirmation', () => {
    const rideId = `solo-history-delete-${Date.now()}`;
    createRideFixture(rideId);
    cy.visit('/ride-history');
    cy.contains('ion-segment-button', 'Solo').click();
    cy.get('ion-item.history-card').should('contain.text', 'Solo ride');

    openDeleteAction(rideId);
    clickDeleteAction(rideId);
    cy.get('ion-alert').should('be.visible');
    cy.get('ion-alert').find('button.alert-button').contains('Cancel').click();
    cy.get('ion-alert').should('not.be.visible');
    readRideRecords(rideId).then((records) => {
      expect(records.sessions).to.have.length(1);
      expect(records.tracks).to.have.length(3);
      expect(records.photos).to.have.length(1);
    });

    openDeleteAction(rideId);
    clickDeleteAction(rideId);
    cy.get('ion-alert').should('be.visible');
    cy.get('ion-alert').find('button.alert-button').contains('Delete ride').click();
    cy.get(`ion-item.history-card[data-ride-id="${rideId}"]`).should('not.exist');
    readRideRecords(rideId).then((records) => {
      expect(records.sessions).to.have.length(0);
      expect(records.tracks).to.have.length(0);
      expect(records.photos).to.have.length(0);
    });
    cy.get(`ion-item.history-card[data-ride-id="${rideId}"]`).should('not.exist');
  });
});
