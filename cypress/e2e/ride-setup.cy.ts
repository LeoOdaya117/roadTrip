const viewportCases = [
  { width: 360, height: 640, name: 'small phone' },
  { width: 390, height: 844, name: 'tall phone' },
  { width: 844, height: 390, name: 'landscape phone' },
  { width: 1280, height: 800, name: 'desktop' },
];

const stubRideSetupServices = () => {
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
  cy.intercept('GET', 'https://*.tile.openstreetmap.org/**', {
    statusCode: 503,
    body: '',
  }).as('failedMapTile');
};

const installLocationStub = (win: Window) => {
  Object.defineProperty(win.navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition(success: (position: GeolocationPosition) => void) {
        success({
          coords: { latitude: 14.6, longitude: 121, accuracy: 5, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
          timestamp: Date.now(),
        } as GeolocationPosition);
      },
      watchPosition() { return 1; },
      clearWatch() {},
    },
  });
  Object.defineProperty(win.navigator, 'permissions', {
    configurable: true,
    value: { query: () => Promise.resolve({ state: 'granted' }) },
  });
};

const openSoloDestination = () => {
  cy.contains('button', 'Start a ride').click();
  cy.contains('How are you riding?').should('be.visible');
  cy.get('.ride-setup-mode-options input[name="ride-mode"][value="solo"]').check({ force: true });
  cy.contains('.ride-setup-actions button', 'Choose destination').click();
  cy.contains('Search destination').should('be.visible');
};

const assertInsideViewport = ($element: JQuery<HTMLElement>, width: number, height: number) => {
  const rect = $element[0].getBoundingClientRect();
  expect(rect.width).to.be.greaterThan(0);
  expect(rect.left).to.be.at.least(0);
  expect(rect.right).to.be.at.most(width + 1);
  expect(rect.top).to.be.at.least(0);
  expect(rect.bottom).to.be.at.most(height + 1);
};

const assertHitTestable = ($element: JQuery<HTMLElement>) => {
  const element = $element[0];
  const rect = element.getBoundingClientRect();
  const topmost = element.ownerDocument.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
  expect(topmost === element || element.contains(topmost), 'control should be unobstructed at its center').to.equal(true);
};

describe('step-by-step ride setup', () => {
  it('keeps Home actions and each web setup stage reachable across phone, landscape, and desktop sizes', () => {
    stubRideSetupServices();
    viewportCases.forEach(({ width, height, name }) => {
      cy.viewport(width, height);
      cy.visit('/home', { onBeforeLoad: installLocationStub });
      cy.get('.crew-create-card .btn-primary').should('be.visible');

      if (width >= 760) {
        cy.get('.crew-join-card .btn-primary').should('be.visible');
        cy.get('.crew-create-card .btn-primary').then(($start) => {
          assertInsideViewport($start, width, height);
          assertHitTestable($start);
        });
        cy.get('.crew-join-card .btn-primary').then(($join) => {
          assertInsideViewport($join, width, height);
          assertHitTestable($join);
        });
        cy.get('.crew-create-card').then(($start) => {
          const startRect = $start[0].getBoundingClientRect();
          cy.get('.crew-join-card').then(($join) => {
            const joinRect = $join[0].getBoundingClientRect();
            expect(Math.abs(startRect.top - joinRect.top), `${name}: Home cards should align`).to.be.lessThan(40);
            expect(startRect.right).to.be.at.most(joinRect.left + 1);
          });
        });
      } else {
        cy.get('ion-content.home-page').then(($content) => ($content[0] as HTMLIonContentElement).scrollToBottom(0));
        cy.get('.crew-join-card .btn-primary').should('be.visible');
      }

      openSoloDestination();
      cy.get('.ride-setup-modal').should('be.visible');
      cy.get('.ride-setup-map-heading').should('be.visible');
      cy.get('label[for="ride-destination-search"]').should('contain.text', 'Search destination');
      cy.get('#ride-destination-search').should('be.visible').type('Tagaytay');
      cy.wait('@destinationSearch');
      cy.get('.ride-setup-results-floating button').contains('Tagaytay').click();
      cy.get('.ride-setup-map-hint').should('contain.text', 'Selected · Tagaytay');
      cy.contains('.ride-setup-actions button', 'Use destination').should('be.visible').then(($button) => {
        assertInsideViewport($button, width, height);
        assertHitTestable($button);
      }).click();

      cy.contains('Review your ride').should('be.visible');
      cy.get('ion-content.ride-setup-modal-content').then(($content) => ($content[0] as HTMLIonContentElement).scrollToBottom(0));
      cy.contains('Android app').should('be.visible');
      cy.contains('.ride-setup-actions button', 'Start solo ride').should('be.visible').then(($button) => {
        assertInsideViewport($button, width, height);
        assertHitTestable($button);
      });
      cy.get('.ride-setup-modal-content').should('be.visible');
      cy.contains('.ride-setup-actions button', 'Edit destination').click();
      cy.contains('.ride-setup-actions button', 'Back').click();
      cy.contains('.ride-setup-actions button', 'Cancel').click();
      cy.get('.ride-setup-modal').should('not.be.visible');
      cy.get('.crew-create-card .btn-primary').should('be.focused');
    });
  });

  it('keeps destination search and attribution available when map tiles fail', () => {
    stubRideSetupServices();
    cy.viewport(390, 844);
    cy.visit('/home', { onBeforeLoad: installLocationStub });
    openSoloDestination();
    cy.get('.leaflet-container').should('be.visible');
    cy.get('.ride-setup-search-attribution').should('be.visible');
    cy.get('.leaflet-control-attribution').should('be.visible');
    cy.get('.ride-setup-map-error').should('be.visible');
    cy.get('#ride-destination-search').type('Tagaytay');
    cy.wait('@destinationSearch');
    cy.get('.ride-setup-results-floating button').contains('Tagaytay').should('be.visible');
    cy.get('@failedMapTile.all').should('have.length.greaterThan', 0);
  });

  it('hides a resume card without deleting its session, track, or photo records', () => {
    const rideId = `solo-cy-hide-${Date.now()}`;
    cy.visit('/home');
    cy.window().then((win) => new Promise<void>((resolve, reject) => {
      const request = win.indexedDB.open('rideTrackerDb');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['sessions', 'tracks', 'photos'], 'readwrite');
        transaction.objectStore('sessions').put({
          rideId,
          userId: 'cypress-user',
          userName: 'Cypress Rider',
          isHost: true,
          isSolo: true,
          createdAt: new Date('2999-01-01T00:00:00.000Z').toISOString(),
          status: 'active',
        });
        transaction.objectStore('tracks').add({
          rideId,
          pointId: `${rideId}-point`,
          segmentId: `${rideId}-segment`,
          source: 'foreground',
          lat: 14.6,
          lng: 121,
          timestamp: new Date().toISOString(),
        });
        transaction.objectStore('photos').add({
          rideId,
          timestamp: new Date().toISOString(),
          note: 'Cypress test photo',
          data: new win.Blob(['test image']),
          thumb: new win.Blob(['test thumbnail']),
        });
        transaction.oncomplete = () => { db.close(); resolve(); };
        transaction.onerror = () => { db.close(); reject(transaction.error); };
      };
    }));

    const readRideRecords = () => cy.window().then((win) => new Promise<{ session: unknown; tracks: unknown[]; photos: unknown[] }>((resolve, reject) => {
      const request = win.indexedDB.open('rideTrackerDb');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['sessions', 'tracks', 'photos'], 'readonly');
        const sessionRequest = transaction.objectStore('sessions').get(rideId);
        const tracksRequest = transaction.objectStore('tracks').index('rideId').getAll(rideId);
        const photosRequest = transaction.objectStore('photos').index('rideId').getAll(rideId);
        transaction.oncomplete = () => {
          db.close();
          resolve({ session: sessionRequest.result, tracks: tracksRequest.result, photos: photosRequest.result });
        };
        transaction.onerror = () => { db.close(); reject(transaction.error); };
      };
    }));

    cy.reload();
    cy.contains('.crew-resume-card', rideId).should('be.visible');
    readRideRecords().then(({ session, tracks, photos }) => {
      expect(session).to.not.equal(undefined);
      expect(tracks).to.have.length(1);
      expect(photos).to.have.length(1);
    });
    cy.contains('.crew-resume-card button', 'Hide for now').click();
    cy.get('.crew-resume-card').should('not.exist');
    readRideRecords().then(({ session, tracks, photos }) => {
      expect(session).to.not.equal(undefined);
      expect(tracks).to.have.length(1);
      expect(photos).to.have.length(1);
    });
  });

  it('uses high contrast primary actions in system, light, and dark themes', () => {
    cy.viewport(390, 844);
    cy.visit('/home');
    ['light', 'dark', ''].forEach((theme) => {
      cy.document().then((document) => {
        if (theme) document.documentElement.dataset.theme = theme;
        else delete document.documentElement.dataset.theme;
      });
      cy.get('.crew-create-card .btn-primary').then(($button) => {
        const style = getComputedStyle($button[0]);
        const parseRgb = (value: string) => value.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [];
        const luminance = (color: number[]) => color.map((channel) => {
          const normalized = channel / 255;
          return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
        }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
        const foreground = luminance(parseRgb(style.color));
        const background = luminance(parseRgb(style.backgroundColor));
        const contrast = (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
        expect(contrast, `${theme || 'system'} theme primary button contrast`).to.be.at.least(4.5);
        expect($button[0].getBoundingClientRect().height).to.be.at.least(48);
      });
    });
    cy.get('.home-account-btn').then(($button) => {
      const rect = $button[0].getBoundingClientRect();
      expect(rect.width).to.be.at.least(48);
      expect(rect.height).to.be.at.least(48);
    });
  });
});
