import Component from '@glimmer/component';

export default class AdressenregisterBusnumberSelectorComponent extends Component {
  get placeholder() {
    return this.args.disabled ? '/' : '';
  }
}
