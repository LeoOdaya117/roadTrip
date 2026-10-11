const rideId = 'solo-cypress-review-actions';
const photoSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" fill="#285E7A"/><circle cx="24" cy="24" r="12" fill="#fff"/></svg>';

const seedRide = () => cy.window().then((win) => new Promise<void>((resolve, reject) => {
  const request = win.indexedDB.open('rideTrackerDb');
  request.onerror = () => reject(request.error);
  request.onsuccess = () => {
    const db = request.result;
    const transaction = db.transaction(['sessions', 'tracks', 'photos'], 'readwrite');
    transaction.objectStore('sessions').put({
      rideId,
      userId: 'cypress-review-user',
      userName: 'Review Rider',
      isHost: true,
      isSolo: true,
      createdAt: '2026-10-09T10:00:00.000Z',
      endedAt: '2026-10-09T10:05:00.000Z',
      status: 'ended',
      distanceMeters: 2400,
      durationSeconds: 300,
      elevationGainMeters: 20,
    });
    Array.from({ length: 10 }, (_, index) => index).forEach((index) => transaction.objectStore('tracks').add({
      rideId,
      pointId: `${rideId}-point-${index}`,
      segmentId: `${rideId}-segment`,
      source: 'foreground',
      lat: 14.59 + index * 0.002,
      lng: 120.98 + index * 0.002,
      speed: 5 + index,
      timestamp: new Date(Date.parse('2026-10-09T10:00:00.000Z') + index * 60000).toISOString(),
    }));
    const image = new win.Blob([photoSvg], { type: 'image/svg+xml' });
    transaction.objectStore('photos').add({
      rideId,
      timestamp: '2026-10-09T10:01:00.000Z',
      note: 'Scenic lookout',
      lat: 14.592,
      lng: 120.982,
      data: image,
      thumb: image,
    });
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
  };
}));

const clearRide = () => cy.window().then((win) => new Promise<void>((resolve, reject) => {
  const request = win.indexedDB.open('rideTrackerDb');
  request.onerror = () => reject(request.error);
  request.onsuccess = () => {
    const db = request.result;
    const transaction = db.transaction(['sessions', 'tracks', 'photos'], 'readwrite');
    transaction.objectStore('sessions').clear();
    transaction.objectStore('tracks').clear();
    transaction.objectStore('photos').clear();
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
  };
}));

const assertSeededTrack = () => cy.window().then((win) => new Promise<void>((resolve, reject) => {
  const request = win.indexedDB.open('rideTrackerDb');
  request.onerror = () => reject(request.error);
  request.onsuccess = () => {
    const db = request.result;
    const transaction = db.transaction('tracks', 'readonly');
    const rows = transaction.objectStore('tracks').index('rideId').getAll(rideId);
    transaction.oncomplete = () => {
      db.close();
      expect(rows.result).to.have.length(10);
      resolve();
    };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
  };
}));

describe('ride review actions: summary, replay, and share', () => {
  beforeEach(() => {
    cy.intercept('GET', '**.tile.openstreetmap.org/**', { statusCode: 204, body: '' });
    cy.visit('/home');
    cy.get('.crew-create-card').should('be.visible');
    clearRide();
    seedRide();
    assertSeededTrack();
  });

  it('opens replay and exercises playback, speed, photo, gallery, then opens share', () => {
    cy.visit(`/ride-history-stats/${rideId}`);
    cy.contains('button', 'Replay ride').scrollIntoView().should('be.enabled').click();
    cy.location('pathname').should('eq', `/ride-replay/${rideId}`);
    cy.contains('.replay-session-title', 'Review Rider').should('be.visible');
    cy.get('.replay-controls ion-button').should('have.length', 3);
    cy.get('.replay-controls').should('contain.text', '1 / 10');
    cy.get('.replay-controls ion-button').should('have.length', 3);

    cy.get('ion-button[aria-label="Play replay"]').should('exist').click();
    cy.get('ion-button[aria-label="Pause replay"]').should('exist').click();
    cy.get('ion-button[aria-label="Play replay"]').should('exist');

    cy.get('ion-range[aria-label="Playback speed"]').should('be.visible').then(($range) => {
      $range[0].dispatchEvent(new CustomEvent('ionChange', { bubbles: true, detail: { value: 2 } }));
    });
    cy.contains('Playback speed: 2x').should('be.visible');

    cy.get('button[aria-label="Jump to photo 1: Scenic lookout"]').click();
    cy.get('button[aria-label="Close selected photo"]').should('be.visible');
    cy.get('button[aria-label="Close selected photo"]').click();
    cy.contains('button', 'Open photo gallery').click();
    cy.get('button[aria-label="Previous photo"]').should('be.visible').and('be.disabled');
    cy.get('button[aria-label="Next photo"]').should('be.visible').and('be.disabled');
    cy.contains('button', 'Close').click();

    cy.get('ion-header.rt-app-header:visible ion-back-button').should('have.length', 1).click();
    cy.location('pathname').should('eq', `/ride-history-stats/${rideId}`);
    cy.get('.summary-screen:visible').should('have.length', 1).within(() => {
      cy.contains('button', 'Replay ride').scrollIntoView().should('be.visible');
    });
    cy.visit(`/ride-history-stats/${rideId}?mode=replay`);
    cy.get('button[aria-label="Open route replay"]').should('be.visible').click();
    cy.location('pathname').should('eq', `/ride-replay/${rideId}`);
    cy.go('back');
    cy.location('pathname').should('eq', `/ride-history-stats/${rideId}`);
    cy.get('.summary-screen:visible').should('have.length', 1).within(() => {
      cy.get('button[aria-label="Open route replay"]').scrollIntoView().should('be.visible');
      cy.contains('button', 'Create Share Image').scrollIntoView().should('be.enabled').click();
    });
    cy.location('pathname').should('eq', `/ride-history-stats/${rideId}/share`);
    cy.get('button[aria-label="Use ride photo 1 as background"]').should('have.attr', 'aria-pressed', 'false').click();
    cy.get('button[aria-label="Use ride photo 1 as background"]').should('have.attr', 'aria-pressed', 'true');

    cy.contains('button', 'Generate Image').click();
    cy.get('img[alt="share preview"], [role="alert"]', { timeout: 15000 }).should('exist').then(($outcome) => {
      if ($outcome.is('[role="alert"]')) {
        cy.get('[role="alert"]').should('be.visible');
        cy.contains('[role="alert"] button', 'Retry').should('be.visible');
      } else {
        cy.get('.share-page-scroll').scrollTo('bottom');
        cy.get('ion-content.share-screen').filter(':visible').should('have.length', 1).within(() => {
          cy.contains('button', 'Download').should('be.visible');
          cy.contains('button', 'Share').should('be.visible');
        });
      }
    });
  });

  it('reports an unknown ride instead of showing fabricated summary data', () => {
    cy.visit('/ride-history-stats/solo-cypress-unknown');
    cy.get('[role="alert"]').should('contain.text', 'was not found on this device');
    cy.contains('Ride complete').should('not.exist');
  });

  it('reports unknown replay and share routes without rendering a ride', () => {
    const missingRideId = 'solo-cypress-unknown-review';

    cy.visit(`/ride-replay/${missingRideId}`);
    cy.get('[role="alert"]').should('contain.text', 'was not found on this device');
    cy.contains('.replay-session-title', missingRideId).should('not.exist');
    cy.contains('No recorded track points are available for this session.').should('not.exist');

    cy.visit(`/ride-history-stats/${missingRideId}/share`);
    cy.get('[role="alert"]').should('contain.text', 'was not found on this device');
    cy.contains('button', 'Generate Image').should('not.exist');
  });

  it('returns to a visible summary from Share and Replay pages', () => {
    cy.visit(`/ride-history-stats/${rideId}`);
    cy.contains('h1', 'Ride complete').should('be.visible');
    cy.contains('button', 'Replay ride').scrollIntoView().should('be.enabled').click();
    cy.contains('.replay-session-title', 'Review Rider').should('be.visible');

    cy.go('back');
    cy.location('pathname').should('eq', `/ride-history-stats/${rideId}`);
    cy.get('.summary-screen:visible').should('have.length', 1).within(() => {
      cy.contains('button', 'Create Share Image').scrollIntoView().should('be.visible').and('be.enabled').click();
    });
    cy.get('ion-header.rt-app-header:visible ion-title').should('have.length', 1).and('contain.text', 'Create Share Image');

    cy.get('ion-header.rt-app-header:visible ion-back-button').should('have.length', 1).click();
    cy.location('pathname').should('eq', `/ride-history-stats/${rideId}`);
    cy.get('.summary-screen:visible').should('have.length', 1).within(() => {
      cy.contains('button', 'Create Share Image').scrollIntoView().should('be.visible');
    });
    cy.get('ion-router-outlet .ion-page:visible').should('have.length', 1);
  });

  it('uses the summary header Back action to return to Ride History', () => {
    cy.visit(`/ride-history-stats/${rideId}`);
    cy.contains('h1', 'Ride complete').should('be.visible');
    cy.get('ion-header.rt-app-header:visible ion-back-button').should('have.length', 1).click();
    cy.location('pathname').should('eq', '/ride-history');
    cy.contains('.history-intro h1', 'Your rides').should('be.visible');
    cy.get('ion-router-outlet .ion-page:visible').should('have.length', 1);
  });
});
