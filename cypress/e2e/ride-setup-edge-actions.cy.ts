const installDestinationStubs = () => {
  const attempts = new Map<string, number>();
  cy.intercept('GET', 'https://photon.komoot.io/api/**', (request) => {
    const query = new URL(request.url).searchParams.get('q') ?? '';
    if (query === 'Empty Place') {
      request.reply({ statusCode: 200, body: { type: 'FeatureCollection', features: [] } });
      return;
    }

    if (query.startsWith('Retry Place')) {
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
              properties: { name: query, city: 'Cavite', country: 'Philippines' },
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

const assertSearchPanelAnchored = (label: string, width: number, height: number) => {
  cy.get('#ride-destination-suggestions').should('be.visible').then(($panel) => {
    const panel = $panel[0];
    const searchCard = panel.parentElement?.querySelector('.ride-setup-search-floating');
    expect(searchCard, `${label}: search card exists beside suggestions`).not.to.equal(null);
    if (!searchCard) return;

    const panelRect = panel.getBoundingClientRect();
    const searchRect = searchCard.getBoundingClientRect();
    expect(panel.parentElement?.classList.contains('ride-setup-map-search'), `${label}: suggestions share the search container`).to.equal(true);
    expect(getComputedStyle(panel).position, `${label}: suggestions stay in document flow`).to.equal('static');
    expect(panelRect.top, `${label}: suggestions touch the search card`).to.be.closeTo(searchRect.bottom, 1);
    expect(panelRect.left, `${label}: suggestions align to the search card left`).to.be.closeTo(searchRect.left, 1);
    expect(panelRect.right, `${label}: suggestions align to the search card right`).to.be.closeTo(searchRect.right, 1);
    expect(panelRect.height, `${label}: status/results surface has height`).to.be.greaterThan(0);
    expect(panelRect.left).to.be.at.least(0);
    expect(panelRect.right).to.be.at.most(width + 1);
    expect(panelRect.top).to.be.at.least(0);
    expect(panelRect.bottom).to.be.at.most(height + 1);
  });
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
    cy.get('.ride-setup-results button').contains('Retry Place').should('be.visible');
  });

  it('keeps loading, empty, error, and result states attached across phone, landscape, and desktop sizes', () => {
    const viewports = [
      { width: 360, height: 640, name: 'small phone' },
      { width: 390, height: 844, name: 'tall phone' },
      { width: 844, height: 390, name: 'landscape phone' },
      { width: 1280, height: 800, name: 'desktop' },
    ];

    cy.intercept('GET', 'https://photon.komoot.io/api/**', (request) => {
      if (new URL(request.url).searchParams.get('q') === 'Loading Place') {
        request.reply({
          delay: 450,
          statusCode: 200,
          body: {
            type: 'FeatureCollection',
            features: [{
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [120.9, 14.1] },
              properties: { name: 'Loading Place', city: 'Cavite', country: 'Philippines' },
            }],
          },
        });
      }
    }).as('responsiveLoadingSearch');

    viewports.forEach(({ width, height, name }) => {
      cy.viewport(width, height);
      cy.visit('/home', { onBeforeLoad: installBrowserLocation });
      openDestinationStep();
      const search = cy.get('#ride-destination-search');

      search.type('Loading Place');
      cy.contains('#ride-destination-suggestions [role="status"]', 'Searching places…').should('be.visible');
      assertSearchPanelAnchored(`${name} loading`, width, height);
      cy.wait('@responsiveLoadingSearch');
      cy.get('.ride-setup-results button').contains('Loading Place').should('be.visible');
      assertSearchPanelAnchored(`${name} results`, width, height);

      search.clear().type('Empty Place');
      cy.wait('@placeSearch');
      cy.contains('#ride-destination-suggestions [role="status"]', 'No places found').should('be.visible');
      assertSearchPanelAnchored(`${name} empty`, width, height);

      const retryQuery = `Retry Place ${name}`;
      search.clear().type(retryQuery);
      cy.wait('@placeSearch');
      cy.contains('#ride-destination-suggestions [role="alert"]', 'HTTP 503').should('be.visible');
      assertSearchPanelAnchored(`${name} error`, width, height);
      cy.contains('#ride-destination-suggestions button', 'Retry search').click();
      cy.wait('@placeSearch');
      cy.get('.ride-setup-results button').contains(retryQuery).should('be.visible');
      assertSearchPanelAnchored(`${name} retry results`, width, height);
    });
  });

  it('scrolls long suggestion lists inside the attached search panel', () => {
    cy.intercept('GET', 'https://photon.komoot.io/api/**', (request) => {
      if (new URL(request.url).searchParams.get('q') !== 'Many Places') return;

      request.reply({
        statusCode: 200,
        body: {
          type: 'FeatureCollection',
          features: Array.from({ length: 8 }, (_, index) => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [120.9 + index * 0.01, 14.1 + index * 0.01] },
            properties: { name: `Many Places ${index + 1}`, city: 'Cavite', country: 'Philippines' },
          })),
        },
      });
    }).as('longPlaceSearch');

    openDestinationStep();
    cy.get('#ride-destination-search').type('Many Places');
    cy.wait('@longPlaceSearch');

    cy.get('#ride-destination-suggestions').should(($panel) => {
      expect($panel[0].scrollHeight).to.be.greaterThan($panel[0].clientHeight);
      expect(getComputedStyle($panel[0]).overflowY).to.be.oneOf(['auto', 'scroll']);
    });
    cy.get('#ride-destination-suggestions').scrollTo('bottom');
    cy.get('#ride-destination-suggestions').should(($panel) => {
      expect($panel[0].scrollTop).to.be.greaterThan(0);
    });
    cy.get('.ride-setup-results button').contains('Many Places 8').should('be.visible');
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

  it('shows the loading state inside the attached panel and collapses it after a map pin is chosen', () => {
    cy.intercept('GET', 'https://photon.komoot.io/api/**', (request) => {
      if (new URL(request.url).searchParams.get('q') === 'Loading Place') {
        request.reply({
          delay: 450,
          statusCode: 200,
          body: {
            type: 'FeatureCollection',
            features: [{
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [120.9, 14.1] },
              properties: { name: 'Loading Place', city: 'Cavite', country: 'Philippines' },
            }],
          },
        });
      }
    }).as('delayedPlaceSearch');

    openDestinationStep();
    cy.get('#ride-destination-search').type('Loading Place');
    cy.contains('#ride-destination-suggestions [role="status"]', 'Searching places…').should('be.visible');
    cy.wait('@delayedPlaceSearch');
    cy.get('.ride-setup-results button').contains('Loading Place').should('be.visible');

    cy.get('.ride-setup-map-wrap .leaflet-container').click('center');
    cy.get('#ride-destination-search').should('have.attr', 'aria-expanded', 'false');
    cy.get('#ride-destination-suggestions').should('not.be.visible');
    cy.get('.ride-setup-map-hint').should('contain.text', 'Selected · Map pin ·');
  });

  it('keeps suggestions collapsed for short input and dismisses the panel before canceling with Escape', () => {
    openDestinationStep();
    cy.get('#ride-destination-search').type('x');
    cy.get('#ride-destination-search').should('have.attr', 'aria-expanded', 'false');
    cy.get('#ride-destination-suggestions').should('not.be.visible');

    cy.get('#ride-destination-search').type('Tagaytay');
    cy.wait('@placeSearch');
    cy.get('#ride-destination-search').should('have.attr', 'aria-expanded', 'true');
    cy.get('#ride-destination-search').type('{esc}');
    cy.get('#ride-destination-search').should('have.attr', 'aria-expanded', 'false');
    cy.get('.ride-setup-modal').should('be.visible');
    cy.get('#ride-destination-search').type('{esc}');
    cy.get('.ride-setup-modal').should('not.be.visible');
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
    cy.get('.ride-setup-results button').contains('Old Place').should('be.visible');

    cy.get('#ride-destination-search').type('{selectall}New Place');
    cy.get('#ride-destination-search').should('have.value', 'New Place');
    cy.get('.ride-setup-results button').contains('Old Place').should('not.exist');
  });

  it('does not let a slower earlier query replace the newer search results', () => {
    cy.intercept('GET', 'https://photon.komoot.io/api/**', (request) => {
      if (new URL(request.url).searchParams.get('q') === 'Slow Query') {
        request.reply({
          delay: 900,
          statusCode: 200,
          body: {
            type: 'FeatureCollection',
            features: [{
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [120.9, 14.1] },
              properties: { name: 'Slow Query', city: 'Cavite', country: 'Philippines' },
            }],
          },
        });
      }
    }).as('slowSearch');
    cy.intercept('GET', 'https://photon.komoot.io/api/**', (request) => {
      if (new URL(request.url).searchParams.get('q') === 'Fast Query') {
        request.reply({
          statusCode: 200,
          body: {
            type: 'FeatureCollection',
            features: [{
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [120.9, 14.1] },
              properties: { name: 'Fast Query', city: 'Cavite', country: 'Philippines' },
            }],
          },
        });
      }
    }).as('fastSearch');

    openDestinationStep();
    const search = cy.get('#ride-destination-search');
    search.type('Slow Query');
    cy.wait(350);
    cy.get('@slowSearch.all').should('have.length', 1);
    search.type('{selectall}Fast Query');
    cy.wait('@fastSearch');
    cy.get('.ride-setup-results button').contains('Fast Query').should('be.visible');
    cy.get('.ride-setup-results button').contains('Slow Query').should('not.exist');
    cy.wait(950);
    cy.get('.ride-setup-results button').contains('Fast Query').should('be.visible');
    cy.get('.ride-setup-results button').contains('Slow Query').should('not.exist');
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
