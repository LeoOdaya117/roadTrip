const installDestinationStubs = () => {
  const attempts = new Map<string, number>();
  cy.intercept('GET', 'https://photon.komoot.io/api/**', (request) => {
    const query = new URL(request.url).searchParams.get('q') ?? '';
    if (query === 'Empty Place') {
      request.reply({ statusCode: 200, body: { type: 'FeatureCollection', features: [] } });
      return;
    }

    if (query === 'Retry Place') {
      const count = (attempts.get(query) ?? 0) + 1;
      attempts.set(query, count);
      if (count === 1) {
        request.reply({ statusCode: 503, body: { message: 'Temporary search failure' } });
      } else {
        request.reply({
          statusCode: 200,
          body: {
            type: 'FeatureCollection',
            features: [{
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [120.9, 14.1] },
              properties: { name: 'Retry Place', city: 'Cavite', country: 'Philippines' },
            }],
          },
        });
      }
      return;
    }

    request.reply({
      statusCode: 200,
      body: {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [120.9, 14.1] },
          properties: { name: query, city: 'Cavite', country: 'Philippines' },
        }],
      },
    });
  }).as('placeSearch');
  cy.intercept('GET', 'https://*.tile.openstreetmap.org/**', { statusCode: 503, body: '' });
};

const installBrowserLocation = (win: Window) => {
  Object.defineProperty(win.navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition(success: (position: GeolocationPosition) => void) {
        success({
          coords: { latitude: 14.6, longitude: 121, accuracy: 5, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
          timestamp: Date.now(),
        } as GeolocationPosition);
      },
      watchPosition: () => 1,
      clearWatch: () => undefined,
    },
  });
  Object.defineProperty(win.navigator, 'permissions', {
    configurable: true,
    value: { query: () => Promise.resolve({ state: 'granted' }) },
  });
};

const openDestinationStep = () => {
  cy.contains('button', 'Start a ride').click();
  cy.contains('.ride-setup-actions button', 'Choose destination').click();
  cy.contains('.ride-setup-heading-copy', 'Choose your destination').should('be.visible');
};

describe('destination setup edge actions', () => {
  beforeEach(() => {
    installDestinationStubs();
    cy.viewport(390, 844);
    cy.visit('/home', { onBeforeLoad: installBrowserLocation });
  });

  it('shows empty results, reports a search error, and retries into selectable results', () => {
    openDestinationStep();
    const search = cy.get('#ride-destination-search');
    search.type('Empty Place');
    cy.wait('@placeSearch');
    cy.contains('[role="status"]', 'No places found').should('be.visible');
    cy.contains('.ride-setup-actions button', 'Use destination').should('be.disabled');

    search.clear().type('Retry Place');
    cy.wait('@placeSearch');
    cy.contains('[role="alert"]', 'Place search service returned HTTP 503').should('be.visible');
    cy.contains('button', 'Retry search').click();
    cy.wait('@placeSearch');
    cy.get('.ride-setup-results-floating button').contains('Retry Place').should('be.visible');
  });

  it('selects a map pin as a candidate and confirms it with Use destination', () => {
    openDestinationStep();
    cy.get('.ride-setup-map-wrap .leaflet-container').should('be.visible').click('center');
    cy.get('.ride-setup-map-hint').should('contain.text', 'Selected · Map pin ·');
    cy.contains('.ride-setup-actions button', 'Use destination').should('be.enabled');
    cy.contains('.ride-setup-heading-copy', 'Choose your destination').should('be.visible');

    cy.contains('.ride-setup-actions button', 'Use destination').click();
    cy.contains('Review your ride').should('be.visible');
    cy.contains('.ride-setup-review-destination strong', 'Map pin ·').should('be.visible');
  });

  it('uses browser location as the destination-search bias on web', () => {
    openDestinationStep();
    cy.get('#ride-destination-search').type('Bias Place');
    cy.wait('@placeSearch').then(({ request }) => {
      const url = new URL(request.url);
      expect(url.searchParams.get('lat')).to.equal('14.6');
      expect(url.searchParams.get('lon')).to.equal('121');
    });
  });

  it('does not leave a previous query result selectable while a replacement query is pending', () => {
    openDestinationStep();
    cy.get('#ride-destination-search').type('Old Place');
    cy.wait('@placeSearch');
    cy.get('.ride-setup-results-floating button').contains('Old Place').should('be.visible');

    cy.get('#ride-destination-search').type('{selectall}New Place');
    cy.get('#ride-destination-search').should('have.value', 'New Place');
    cy.get('.ride-setup-results-floating button').contains('Old Place').should('not.exist');
  });

  it('supports arrow-key ride-type selection and keeps keyboard focus inside the setup modal', () => {
    cy.contains('button', 'Start a ride').click();
    const solo = cy.get('.ride-setup-mode-options input[name="ride-mode"][value="solo"]');
    const group = cy.get('.ride-setup-mode-options input[name="ride-mode"][value="group"]');
    solo.focus({ force: true }).should('be.focused').type('{downarrow}', { force: true });
    group.should('be.checked').and('be.focused');
    group.type('{uparrow}', { force: true });
    solo.should('be.checked').and('be.focused');

    cy.get('.ride-setup-actions button').last().focus().trigger('keydown', { key: 'Tab', code: 'Tab', keyCode: 9, which: 9, force: true });
    cy.focused().then(($active) => {
      const modal = Cypress.$('ion-modal.ride-setup-modal')[0];
      expect(modal?.contains($active[0]), 'keyboard focus remains inside ride setup').to.equal(true);
    });
  });
});
