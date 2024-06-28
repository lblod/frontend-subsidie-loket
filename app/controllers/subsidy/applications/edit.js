import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { task } from 'ember-concurrency';
import fetch from 'fetch';
import { action } from '@ember/object';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';

export default class SubsidyApplicationsEditController extends Controller {
  @service router;
  @service() store;

  constructor() {
    super(...arguments);
    window.addEventListener('beforeprint', this.prepareTextareasForPrinting);
  }

  get reeksHasStartOrEnd() {
    return (
      this.consumption.get(
        'subsidyApplicationFlow.subsidyMeasureOfferSeries.period.begin'
      ) ||
      this.consumption.get(
        'subsidyApplicationFlow.subsidyMeasureOfferSeries.period.end'
      )
    );
  }

  get consumption() {
    return this.model.consumption;
  }

  get organization() {
    return this.model.organization;
  }

  get canDelete() {
    return this.model.consumption.get('status.isConcept');
  }
  @action
  exportSubsidyAsPDF() {
    window.print();
  }

  prepareTextareasForPrinting() {
    // Remove any previously created print divs
    const existingPrintDivs = document.querySelectorAll(
      '.textarea, .display-on-print'
    );
    existingPrintDivs.forEach((div) => div.remove());

    // Store original textareas
    const textareas = document.querySelectorAll('textarea');

    // Replace textareas with divs
    textareas.forEach((textarea) => {
      const div = document.createElement('div');
      div.textContent = textarea.value;
      div.style.whiteSpace = 'pre-wrap';
      div.style.border = '1px solid #ccc';
      div.style.padding = '5px';
      div.style.minHeight = `${textarea.offsetHeight}px`;
      div.classList.add('display-on-print');
      div.classList.add('textarea', 'display-on-print');

      textarea.classList.add('au-u-hide-on-print');
      textarea.parentNode.insertBefore(div, textarea);
    });
  }

  @action
  async collectDownloadLinks() {
    // Get all attachments based on the data-test-file-card-download attribute
    let elements = document.querySelectorAll(
      '[data-test-file-card-download=""]'
    );
    this.downloadLinks = Array.from(elements).map((link) => ({
      url: link.href,
      filename: link.getAttribute('download'),
    }));
  }

  @action
  async downloadBijlagen() {
    await this.collectDownloadLinks();
    if (this.downloadLinks.length === 0) return;

    const zip = new JSZip();
    for (let link of this.downloadLinks) {
      const response = await fetch(link.url);
      const blob = await response.blob();
      zip.file(link.filename, blob);
    }

    // Get the subsidy name and selected step name so the zip download can look like '<subsidy name> - <subsidy step name>.zip'
    const currentStepID = this.router.currentRoute.parent.params.step_id;
    const currentStep = await this.store.findRecord(
      'subsidy-application-flow-step',
      currentStepID,
      {
        include: 'subsidy-procedural-step',
      }
    );
    const currentProceduralStep = await currentStep.subsidyProceduralStep;
    const currentProceduralStepName = currentProceduralStep.description;
    const currentSubsidyName = this.consumption.get(
      'subsidyMeasureOffer.title'
    );

    const filename = `${currentSubsidyName} - stap ${currentProceduralStepName}.zip`;

    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, filename);
  }

  @task
  *delete() {
    if (!this.canDelete || !this.consumption.isStable) {
      return;
    }

    try {
      this.consumption.isStable = false;
      /**
       * NOTE: this endpoint prevents the removal of submitted forms, preventing the removal of a consumption all together.
       */
      const forms = yield this.consumption.subsidyApplicationForms;
      for (const form of forms) {
        yield fetch(`/management-application-forms/${form.id}`, {
          method: 'DELETE',
        });
      }

      const participations = yield this.consumption.participations;
      yield Promise.all(
        participations.map((participation) => participation.destroyRecord())
      );

      // We intentionally don't use 'destroyRecord` here since that calls unloadRecord before the
      // transition which causes issues in the ConsumptionStatusPill component
      this.consumption.deleteRecord();
      yield this.consumption.save();
      this.router.transitionTo('subsidy.applications');
      this.consumption.unloadRecord();
    } catch (error) {
      console.log('Removal of consumption failed because:');
      console.error(error);
      // TODO Error handling
    } finally {
      this.consumption.isStable = true;
    }
  }
}
