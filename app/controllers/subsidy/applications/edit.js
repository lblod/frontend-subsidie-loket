import Controller from '@ember/controller';
import { inject as service } from '@ember/service';
import { task } from 'ember-concurrency';
import fetch from 'fetch';
import { action } from '@ember/object';
import { downloadZip } from 'client-zip';
import { triggerZipDownload } from 'frontend-subsidiepunt/utils/download';

export default class SubsidyApplicationsEditController extends Controller {
  @service router;
  @service() store;

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

  get canDownload() {
    return !this.model.consumption.get('status.isConcept');
  }

  @action
  async exportSubsidyAsPDF() {
    await this.prepareTextareasForPrinting();
    const previousDocumentTitle = document.title;
    const filename = `${await this.createFilename()}.pdf`;

    // Update the page title temporarily to the subsidy step, so when the user prints to pdf it will have the subsidy step as filename
    document.title = filename;

    window.addEventListener(
      'afterprint',
      () => {
        document.title = previousDocumentTitle;
      },
      { once: true }
    );
    window.print();
  }

  async prepareTextareasForPrinting() {
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
      name: link.getAttribute('download'),
    }));
  }

  async createFilename() {
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
    const currentSubsidy = await this.consumption.subsidyMeasureOffer;
    const currentSubsidyName = currentSubsidy.title;

    const filename = `${currentSubsidyName} - stap ${currentProceduralStepName}`;
    return filename;
  }

  @action
  async downloadBijlagen() {
    await this.collectDownloadLinks();
    if (this.downloadLinks.length === 0) return;

    const files = await Promise.all(
      this.downloadLinks.map(async (link) => {
        const response = await fetch(link.url);
        return {
          name: link.name,
          input: await response.blob(),
        };
      })
    );

    const filename = `${await this.createFilename()}.zip`;

    const blob = await downloadZip(files).blob();
    triggerZipDownload(blob, filename);
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
