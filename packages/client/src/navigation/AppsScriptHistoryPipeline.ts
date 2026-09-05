import { AppsScriptContainer } from "./AppsScriptContainer";
import { AppsScriptIframe } from "./AppsScriptIframe";

export class AppsScriptHistoryPipeline {
  constructor(
    private readonly container: AppsScriptContainer,
    private readonly iframe: AppsScriptIframe,
  ) {}

  static create(callback: (pipeline: AppsScriptHistoryPipeline) => void) {
    AppsScriptContainer.load((container) => {
      callback(
        new AppsScriptHistoryPipeline(container, new AppsScriptIframe()),
      );
    });
  }

  sync() {
    this.iframe.sync(this.container.current());

    this.container.observe((entry) => {
      this.iframe.sync(entry);
    });

    return this.iframe.observe((entry) => {
      this.container.sync(entry);
    });
  }
}
