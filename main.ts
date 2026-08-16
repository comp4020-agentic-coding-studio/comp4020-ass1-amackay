// The page's entry. Module scripts are deferred, so the document is parsed by
// the time this runs and there is nothing to wait for.
import { mount } from "./src/ui/app";

mount(document);
