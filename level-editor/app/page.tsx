'use client';
import { Editor } from '../../src/editor/editor';
import { repositoryPersistence } from '../editor/repository-adapter';

export default function RepositoryEditor() {
  return <Editor persistence={repositoryPersistence} />;
}
