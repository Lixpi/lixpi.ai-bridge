<script lang="ts">
    import { run } from 'svelte/legacy';

    import { onMount, onDestroy, tick } from 'svelte'


    import { ProseMirrorEditor } from './components/editor.js'
    import { isUUID } from '$src/helpers/is-uuid.js'

    import DocumentService from '$src/services/document-service.ts'
    import AiChatService from '$src/services/ai-chat-service.ts'
    import RouterService from '$src/services/router-service.ts'

    import { routerStore } from '$src/stores/routerStore.ts'
    import { documentsStore } from '$src/stores/documentsStore.ts'
    import { documentStore } from '$src/stores/documentStore.ts'
    import { aiModelsStore } from '$src/stores/aiModelsStore.ts'
    import { servicesStore } from '$src/stores/servicesStore.ts'
    import { userStore } from '$src/stores/userStore.ts'

    import {
        LoadingStatus,
        type AiModelId
    } from '@lixpi/constants'

    import Spinner from `$src/components/spinner.svelte`

    import DropdownMenu from '../inputs/dropdown-menu.svelte'
    // import UserMenu from '../user-menu.svelte'
    import DropdownMenuTagPill from '../inputs/dropdown-menu-tag-pill.svelte'

    import {
        gptAvatarIcon,
        claudeIcon,
    } from '$src/svgIcons'

    /**
     * @typedef {Object} Props
     * @property {boolean} [isDisabled]
     */

    /** @type {Props} */
    let { isDisabled = false } = $props();

    let isFocused = false
    let aiChatInstance = $state(null)
    let editorInstance = null

    const documentService = new DocumentService()


    const onAiChatSubmit = ({ messages, aiModel }: { messages: any; aiModel: AiModelId }) => {
        // console.log('onAiChatSubmit', {messages, aiModel, aiChatInstance})

        if (!aiChatInstance) {
            console.log('call->onAiChatSubmit', {aiChatInstance, projectKey: $routerStore.data.currentRoute?.routeParams.key})
            alert('🚫 call->onAiChatSubmit :: aiChatInstance is not initialized... \n\nPlease call 📞 Shallbee 🐝 immediatelly!');

            return false
        }

        aiChatInstance.sendMessage(messages, aiModel)
    }

    const onProjectTitleChange = inputValue => {
        // console.log('onProjectTitleChange', inputValue)
        $documentStore.data.title = inputValue

        // Trigger save to db by setting the requiresSave flag
        documentStore.setMetaValues({
            requiresSave: true
        })

        // Sync the project title with the documentsStore store
        documentsStore.updateDocument($documentStore.data.documentId, {
            title: inputValue
        })
        // const projectService = DocumentService.getInstance($documentStore.data.documentId)
        documentService.updateDocument({
            documentId: $documentStore.data.documentId,
            title: $documentStore.data.title,
            // prevRevision: $documentStore.data.prevRevision,
            // content: value,
            // aiModel: $documentStore.data.aiModel,
        })
    }

    let timerId;
    const onEditorChange = value => {
        // console.log('onEditorChange', value)
        $documentStore.data.content = value;

        // Clear the previous timer if it exists
        if (timerId) {
            clearTimeout(timerId);
        }

        // Set a new timer
        timerId = setTimeout(() => {
            documentStore.setMetaValues({
                requiresSave: true
            })

            documentService.updateDocument({
                documentId: $documentStore.data.documentId,
                title: $documentStore.data.title,
                prevRevision: $documentStore.data.prevRevision,
                content: value,
                aiModel: $documentStore.data.aiModel,
            })
        }, 300);

    };

    $effect(() => {
        if (
            $documentStore.meta.loadingStatus === LoadingStatus.success &&
            !$documentStore.meta.isRendered
        ) {
            const initialContent = $documentStore.data.content;
            const parentContainer = document.querySelector(".editor-wrapper");
            const existingEditor = document.querySelector("#editor");
            const existingContent = document.querySelector("#content");

            // Remove existing 'editor' and 'content' elements if they exist
            if (existingEditor) parentContainer.removeChild(existingEditor);
            if (existingContent) parentContainer.removeChild(existingContent);

            // Create new 'editor' and 'content' elements
            const newEditor = document.createElement("div");
            newEditor.id = "editor";
            const newContent = document.createElement("div");
            newContent.id = "content";

            // Append the new elements to the parent container
            parentContainer.appendChild(newEditor);
            parentContainer.appendChild(newContent);

            if (editorInstance) {
                editorInstance.destroy()
                editorInstance = null
            }

            if (aiChatInstance) {
                aiChatInstance.disconnect()
                aiChatInstance = null
            }

            editorInstance = new ProseMirrorEditor(newEditor, newContent, initialContent, isDisabled, onEditorChange, onProjectTitleChange, onAiChatSubmit);
            aiChatInstance = new AiChatService(RouterService.getRouteParams().documentId as string)
            documentStore.setMetaValues({ isRendered: true })
        }
    });


    onMount(() => {})

    onDestroy(() => {
        if (aiChatInstance) {
            aiChatInstance.disconnect()
            editorInstance.destroy()
            aiChatInstance = null
            editorInstance = null
        }
    })

    let submenuState = $state({})

    const toggleEditorSubmenuHandler = (e, documentId) => {
        e.stopPropagation()
        submenuState[documentId] = !submenuState[documentId]
    }

    const aiAvatarIcons = {
        gptAvatarIcon,
        claudeIcon,
    }

    let aiModelsSelectorDropdownOptions = $derived($aiModelsStore.data.map(aiModel => ({
        title: aiModel.title,
        icon: aiAvatarIcons[aiModel.iconName],
        color: aiModel.color,
        aiModel: `${aiModel.provider}:${aiModel.model}`,
        onClick: (e, id) => {
            console.log('onClick', {provider: aiModel.provider, model: aiModel.model})
            documentStore.setDataValues({
                aiModel: `${aiModel.provider}:${aiModel.model}`
            })
            documentStore.setMetaValues({
                requiresSave: true
            })
        }
    })))



    // let selectedValue = null;
    // let options = [
    //     { id: 1, title: 'Option 1', color: '#ff0000' },
    //     { id: 2, title: 'Optionnnn 2', color: '#00ff00' },
    //     { id: 3, title: 'Opti 3', color: '#0000ff' },
    // ];
    // let isDisabledDummy = false;

    // const updateCallback = () => {
    //     console.log('Dropdown value has been updated');
    // };

</script>
<!--
<div class="editor-top-menu-bar">

</div> -->

<div class="model-selector-wrapper flex justify-between items-center">
    <!-- <div class="ai-model-info">
        {#if $documentStore.data.aiModel !== ''}
            <span
                class="current-ai-model"
                style="
                    background: {aiModels[$documentStore.data.aiModel]?.color};
                    color: white;
                "
            >
                {aiModels[$documentStore.data.aiModel]?.title}
            </span>
        {/if}
    </div> -->
    <DropdownMenuTagPill
        selectedValue={aiModelsSelectorDropdownOptions.find(model => model.aiModel === $documentStore.data.aiModel)}
        submenuState={submenuState}
        id={'dropdown-menu-tag-pill'}
        toggleSubmenuHandler={toggleEditorSubmenuHandler}
        theme="dark"
        renderPosition="bottom"
        dropdownOptions={aiModelsSelectorDropdownOptions}
    />

    <!-- <DropdownMenu
        submenuState={submenuState}
        id={'asdf'}
        toggleSubmenuHandler={toggleEditorSubmenuHandler}
        theme="dark"
        dropdownOptions={dropdownOptions}
    /> -->
</div>

<!-- <div class="user-menu">
    <UserMenu theme='light' />
</div> -->

<div class="editor-wrapper {isDisabled && 'disabled'} {isFocused && 'is-editor-focused'}"></div>

<style lang="scss">
    //NOTE Shared SASS variables available globally

    // .editor-top-menu-bar {
    //     // background: orange;
    //     background: rgba(255, 255, 255, 1);
    //     width: 100%;
    //     height: 10px;
    //     position: absolute;
    //     top: 0;
    //     left: 0;
    //     z-index: 999;

    //     // backdrop-filter: blur(10px);
    //     // filter:blur(4px);
    //     // -o-filter:blur(4px);
    //     // -ms-filter:blur(4px);
    //     // -moz-filter:blur(4px);
    //     // -webkit-filter:blur(4px);
    // }

    // .user-menu {
    //     position: absolute;
    //     top: 3px;
    //     right: 1rem;
    //     z-index: 99999;
    // }

    .model-selector-wrapper {
        // border: 1px solid red;
        position: absolute;
        // left: 13rem;
        // bottom: 2rem;
        top: 14px;
        right: 4rem;
        // z-index: 999;
        width: auto;
        user-select: none;
        // .current-ai-model {
        //     padding: 0.2rem 0.3rem;
        //     border-radius: 4px;
        //     font-size: 0.85rem;
        //     font-weight: 500;
        //     margin-right: 1.7rem;
        //     line-height: 1.3;
        // }
        // :global(.dots-dropdown-menu button) {
        //     margin-top: 0.01rem
        // }
    }

    //TODO move to prosemirror styles file
    .prosemirror-menu {
        position: sticky;
        width: 100%;
        box-shadow: 0px 0px 8px 0 rgba(0, 0, 0, 0.2);
        top: 0;
        z-index: 99999;

    }

    .editor-wrapper {
      // height: auto;
      height: 100%;
      width: 100%;
      display: flex;
      flex-direction: column;
      overflow-x: hidden;
      #editor {
        height: 100%;
        height: auto;
        width: auto;
        flex: 1;
      }
      //TODO refactor, move to prosemirror styles file
      // &.disabled :global()
      &.disabled :global(.ProseMirror-menubar) {
        padding: 0;
        // border-color: red;
        border-color: #e4e4e4;
        box-shadow: none;
      }
      &.disabled :global(.ProseMirror) {
        // padding-top: 1.3rem !important;

      }
      &.disabled :global(.ProseMirror-menubar .ProseMirror-menuitem) {
        display: none;
      }
    }



</style>
