const mockDestinationServices = () => {
  cy.intercept('GET', 'https://photon.komoot.io/api/**', {
    statusCode: 200,
    body: {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [120.9, 14.1] },
        properties: { name: 'Tagaytay', city: 'Cavite', state: 'Calabarzon', country: 'Philippines' },
      }],
    },
  }).as('destinationSearch');
  cy.intercept('GET', 'https://*.tile.openstreetmap.org/**', { statusCode: 503, body: '' });
};

const clearRideDatabase = () => cy.window().then((win) => new Promise<void>((resolve, reject) => {
  const request = win.indexedDB.open('rideTrackerDb');
  request.onerror = () => reject(request.error);
  request.onsuccess = () => {
    const db = request.result;
    const storeNames = ['sessions', 'locations', 'tracks', 'photos', 'outbox'].filter((name) => db.objectStoreNames.contains(name));
    if (!storeNames.length) {
      db.close();
      resolve();
      return;
    }
    const transaction = db.transaction(storeNames, 'readwrite');
    storeNames.forEach((name) => transaction.objectStore(name).clear());
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
  };
}));

const seedResumeSession = (rideId: string, isSolo: boolean) => cy.window().then((win) => new Promise<void>((resolve, reject) => {
  const request = win.indexedDB.open('rideTrackerDb');
  request.onerror = () => reject(request.error);
  request.onsuccess = () => {
    const db = request.result;
    const transaction = db.transaction(['sessions', 'tracks', 'photos'], 'readwrite');
    transaction.objectStore('sessions').put({
      rideId,
      userId: `user-${rideId}`,
      userName: 'Saved Rider',
      isHost: isSolo,
      isSolo,
      createdAt: new Date().toISOString(),
      status: 'active',
    });
    transaction.objectStore('tracks').add({
      rideId,
      pointId: `point-${rideId}`,
      segmentId: `segment-${rideId}`,
      source: 'foreground',
      lat: 14.6,
      lng: 121,
      timestamp: new Date().toISOString(),
    });
    transaction.objectStore('photos').add({
      rideId,
      timestamp: new Date().toISOString(),
      note: 'Kept photo',
      data: new win.Blob(['photo data']),
      thumb: new win.Blob(['thumbnail data']),
    });
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
  };
}));

const readResumeRecords = (rideId: string) => cy.window().then((win) => new Promise<{ session: unknown; tracks: unknown[]; photos: unknown[] }>((resolve, reject) => {
  const request = win.indexedDB.open('rideTrackerDb');
  request.onerror = () => reject(request.error);
  request.onsuccess = () => {
    const db = request.result;
    const transaction = db.transaction(['sessions', 'tracks', 'photos'], 'readonly');
    const session = transaction.objectStore('sessions').get(rideId);
    const tracks = transaction.objectStore('tracks').index('rideId').getAll(rideId);
    const photos = transaction.objectStore('photos').index('rideId').getAll(rideId);
    transaction.oncomplete = () => {
      db.close();
      resolve({ session: session.result, tracks: tracks.result, photos: photos.result });
    };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
  };
}));

const chooseGroupDestination = () => {
  cy.contains('button', 'Start a ride').click();
  cy.get('.ride-setup-mode-options input[name="ride-mode"][value="group"]').check({ force: true });
  cy.contains('.ride-setup-actions button', 'Choose destination').click();
  cy.get('#ride-destination-search').type('Tagaytay');
  cy.wait('@destinationSearch');
  cy.get('.ride-setup-results-floating button').contains('Tagaytay').click();
  cy.contains('.ride-setup-actions button', 'Use destination').click();
  cy.contains('Review your ride').should('be.visible');
};

describe('Home actions and ride setup controls', () => {
  beforeEach(() => {
    cy.visit('/home');
    clearRideDatabase();
    cy.window().then((win) => win.localStorage.clear());
    cy.reload();
  });

  it('validates join, shows loading, reports API errors, and recovers to the group lobby', () => {
    let attempts = 0;
    cy.intercept('POST', 'http://localhost:8000/api/rides/CREW42/join', (request) => {
      attempts += 1;
      if (attempts === 1) request.reply({ statusCode: 404, body: { message: 'Ride code not found' } });
      else request.reply({
        statusCode: 200,
        delay: 600,
        body: { rideId: 'joined-crew', rider: { id: 'guest', name: 'Guest', lat: 14.6, lng: 121, speed: null, timestamp: new Date().toISOString() } },
      });
    }).as('joinRequest');

    cy.contains('button', 'Join Ride').click();
    cy.contains('[role="alert"]', 'Enter a ride code to join.').should('be.visible');
    cy.get('@joinRequest.all').should('have.length', 0);

    cy.get('#ride-code').type('CREW42');
    cy.contains('button', 'Join Ride').click();
    cy.wait('@joinRequest');
    cy.contains('[role="alert"]', 'Ride code not found').should('be.visible');
    cy.contains('button', 'Join Ride').should('be.enabled');

    cy.contains('button', 'Join Ride').click();
    cy.contains('Joining…').should('be.visible');
    cy.wait('@joinRequest');
    cy.location('pathname').should('eq', '/ride-lobby/joined-crew');
    cy.contains('.ride-code-value', 'joined-crew').should('be.visible');
  });

  it('creates a group only after destination review and recovers from create failure', () => {
    mockDestinationServices();
    let attempts = 0;
    cy.intercept('POST', 'http://localhost:8000/api/rides', (request) => {
      attempts += 1;
      if (attempts === 1) request.reply({ statusCode: 503, body: { message: 'Service unavailable' } });
      else request.reply({
        statusCode: 201,
        delay: 600,
        body: { rideId: 'created-crew', rider: { id: 'host', name: 'Host', lat: 14.6, lng: 121, speed: null, timestamp: new Date().toISOString() } },
      });
    }).as('createRequest');

    chooseGroupDestination();
    cy.contains('.ride-setup-actions button', 'Create group ride').click();
    cy.wait('@createRequest');
    cy.contains('.ride-setup-modal [role="alert"]', 'Service unavailable').should('be.visible');
    cy.get('.ride-setup-modal').should('be.visible');

    cy.contains('.ride-setup-actions button', 'Create group ride').click();
    cy.contains('.ride-setup-actions button', 'Starting…').should('be.visible');
    cy.wait('@createRequest');
    cy.location('pathname').should('eq', '/ride-lobby/created-crew');
    cy.contains('.ride-code-value', 'created-crew').should('be.visible');
  });

  it('resumes solo rides to the map and group rides to the lobby', () => {
    const soloId = 'solo-home-action-check';
    seedResumeSession(soloId, true);
    cy.reload();
    cy.contains('.crew-resume-card', soloId).should('be.visible');
    cy.contains('.crew-resume-card button', 'Resume Ride').click();
    cy.location('pathname').should('eq', `/ride-map/${soloId}`);

    cy.visit('/home');
    clearRideDatabase();
    const groupId = 'group-home-action-check';
    seedResumeSession(groupId, false);
    cy.reload();
    cy.contains('.crew-resume-card', groupId).should('be.visible');
    cy.contains('.crew-resume-card button', 'Resume Ride').click();
    cy.location('pathname').should('eq', `/ride-lobby/${groupId}`);
    cy.contains('.ride-code-value', groupId).should('be.visible');
  });

  it('hides a resume card only in the mounted Home view and restores it after reload with saved rows intact', () => {
    const rideId = 'solo-hide-only-home';
    seedResumeSession(rideId, true);
    cy.reload();
    cy.contains('.crew-resume-card', rideId).should('be.visible');
    cy.contains('.crew-resume-card button', 'Hide for now').click();
    cy.get('.crew-resume-card').should('not.exist');
    readResumeRecords(rideId).then(({ session, tracks, photos }) => {
      expect(session).to.not.equal(undefined);
      expect(tracks).to.have.length(1);
      expect(photos).to.have.length(1);
    });

    cy.reload();
    cy.contains('.crew-resume-card', rideId).should('be.visible');
    readResumeRecords(rideId).then(({ session, tracks, photos }) => {
      expect(session).to.not.equal(undefined);
      expect(tracks).to.have.length(1);
      expect(photos).to.have.length(1);
    });
  });

  it('keeps wizard selections on Back, dismisses on Escape, and restores focus to Start a ride', () => {
    cy.contains('button', 'Start a ride').click();
    cy.contains('.ride-setup-heading-copy', 'How are you riding?').should('be.visible');
    cy.get('.ride-setup-heading-copy').should('have.attr', 'tabindex', '-1');
    cy.get('.ride-setup-heading-copy').should('have.focus');
    cy.get('.ride-setup-mode-options input[name="ride-mode"][value="group"]').check({ force: true });
    cy.get('.ride-setup-mode-options input[name="ride-mode"][value="group"]').should('be.checked');
    cy.contains('.ride-setup-actions button', 'Choose destination').click();
    cy.get('.ride-setup-heading-copy').should('have.focus');
    cy.contains('.ride-setup-actions button', 'Back').click();
    cy.get('.ride-setup-mode-options input[name="ride-mode"][value="group"]').should('be.checked');

    cy.get('body').type('{esc}', { force: true });
    cy.get('.ride-setup-modal').should('not.be.visible');
    cy.contains('button', 'Start a ride').should('be.focused');
  });

  it('focuses the persistent ride-code field from its shortcut action', () => {
    cy.viewport(390, 844);
    cy.get('#ride-code').should('have.attr', 'id', 'ride-code');
    cy.get('button[aria-label="Focus code input"]').should('be.visible').then(($button) => {
      const rect = $button[0].getBoundingClientRect();
      expect(rect.width).to.be.at.least(48);
      expect(rect.height).to.be.at.least(48);
      const topmost = $button[0].ownerDocument.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      expect(topmost === $button[0] || $button[0].contains(topmost)).to.equal(true);
    }).click();
    cy.get('#ride-code').should('be.focused');
  });
});
