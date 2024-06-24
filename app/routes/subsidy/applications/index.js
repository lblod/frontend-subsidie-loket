/* eslint-disable ember/no-mixins */
import Route from '@ember/routing/route';
import { inject as service } from '@ember/service';
import DataTableRouteMixin from 'ember-data-table/mixins/route';
import { ROLES } from 'frontend-subsidie-loket/models/participation';
import isFeatureEnabled from 'frontend-subsidie-loket/helpers/is-feature-enabled';

export default class SubsidyApplicationsIndexRoute extends Route.extend(
  DataTableRouteMixin
) {
  @service currentSession;
  @service store;
  @service router;

  modelName = 'subsidy-measure-consumption';

  beforeModel() {
    console.log('role', this.currentSession.groupClassification.label);
    // TODO: change to economische actoren, once implemented
    if (
      isFeatureEnabled('verenigingenUnderConstruction') &&
      this.currentSession.groupClassification.label === 'Gemeente'
    ) {
      this.router.replaceWith('under-construction');
    };
  }

  mergeQueryOptions() {
    let groupId = this.currentSession.group.id;
    return {
      include: [
        'status',
        'subsidy-measure-offer',
        'subsidy-application-forms',
        'subsidy-application-flow.subsidy-measure-offer-series.period',
        'active-subsidy-application-flow-step.subsidy-procedural-step.period',
        'participations',
        'last-modifier',
      ].join(','),
      filter: {
        participations: {
          'participating-bestuurseenheid': {
            id: groupId,
          },
          ':exact:role': ROLES.APPLICANT,
        },
      },
    };
  }
}
