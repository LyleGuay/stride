import { TABLE_METADATA_KEY, TableMetadata } from "./decorators";

export class EntityStore {
  private static metadatas: TableMetadata[] = [];

  static getAll() {
    return EntityStore.metadatas;
  }

  static get(entity: any) {
    return EntityStore.metadatas.find((e) => e.classObj == entity);
  }

  static register(entity: any) {
    const metadata: TableMetadata | undefined = Reflect.getMetadata(
      TABLE_METADATA_KEY,
      entity
    );
    if (!metadata) {
      throw new Error("Expected a @Table() decorator!");
    }

    console.log(`Register Entity ${metadata.tableName}`);
    this.metadatas.push(metadata);
  }
}
