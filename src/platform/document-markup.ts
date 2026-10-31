/** Convert backend HTML to readable plain text without loading resources or inserting remote markup. */
export function documentMarkupText(value: string): string {
  const factory = Reflect.get(Components.classes, '@mozilla.org/parserutils;1') as {
    getService(iid: unknown): {
      convertToPlainText(value: string, flags: number, wrap: number): string;
    };
  };
  const parser = factory.getService(Components.interfaces.nsIParserUtils);
  return parser.convertToPlainText(value, 0, 0);
}
