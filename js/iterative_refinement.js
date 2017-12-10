/*
University of Freiburg WS 2017/2018
Chair for Bioinformatics
Supervisor: Martin Raden
Author: Alexander Mattheis
*/

"use strict";

/**
 * Defines tasks after page-loading.
 */
$(document).ready(function () {
    if (loaded === ALGORITHMS.ITERATIVE_REFINMENT) {  // to avoid self execution on a script import
        iterativeRefinement.startIterativeRefinement();
        loaded = ALGORITHMS.NONE;
    }
});

(function () {  // namespace
    // public methods
    namespace("iterativeRefinement", startIterativeRefinement, IterativeRefinement);

    // instances
    var multiSequenceAlignmentInstance;

    var iterativeRefinementInstance;
    var fengDoolittleInstance;
    var gotohInstance;

    // shared variables
    var inputData = {};  // stores the input of the algorithm
    var outputData = {};  // stores the output of the algorithm

    /**
     * Function managing objects.
     */
    function startIterativeRefinement() {
        var multiSequenceInterface = new interfaces.multiSequenceInterface.MultiSequenceInterface();
        multiSequenceInterface.startMultiSequenceInterface(IterativeRefinement, ALGORITHMS.ITERATIVE_REFINMENT);
    }

    /*---- ALGORITHM ----*/
    /**
     * Computes an affine multi-sequence-alignment (non-optimal approach) with Feng-Doolittle
     * and afterwards post-processes the multi-sequence-alignment with an iterative refinement.
     * @constructor
     * @augments MultiSequenceAlignment
     * @see http://www.bioinf.uni-freiburg.de/Lehre/Courses/2017_SS/V_BioinfoII/ (just used to get some ideas)
     */
    function IterativeRefinement() {
        iterativeRefinementInstance = this;

        // variables
        this.type = ALGORITHMS.ITERATIVE_REFINMENT;

        // instances (do not change order)
        multiSequenceAlignmentInstance = new bases.multiSequenceAlignment.MultiSequenceAlignment(this);
        gotohInstance = new gotoh.Gotoh();
        fengDoolittleInstance = new fengDoolittle.FengDoolittle();

        // public class methods
        this.getInput = getInput;

        this.setInput = setInput;
        this.compute = compute;
        this.getOutput = getOutput;

        this.setIO = setIO;
        this.getSuperclass = getSuperclass;
    }

    /**
     * Returns the input data of the algorithm.
     * @return {Object} - Contains all input data.
     */
    function getInput() {
        return inputData;
    }

    /**
     * Sets the algorithm input for an appropriate algorithm
     * which is using the inputViewmodel properties in its computations.
     * @param inputViewmodel {Object} - The InputViewmodel of an appropriate algorithm.
     */
    function setInput(inputViewmodel) {
        multiSequenceAlignmentInstance.setIO(inputData, {});
        multiSequenceAlignmentInstance.setInput(inputViewmodel);

        inputData.iterativeRefinementSubalgorithm = inputViewmodel.selectedApproach()[0];  // because it's array from which we choose
    }

    /**
     * Starts the computation.
     */
    function compute() {
        debugger;
        initializeStructs();

        var ioData = computeFengDoolittle();
        var startMsa = ioData[1].progressiveAlignment.slice();
        var startMsaSequenceNames
            = multiSequenceAlignmentInstance.getIndividualSequenceNames(ioData[1].joinedGroupNames[ioData[1].joinedGroupNames.length - 1]);

        var names = getNamesInOrderAddedToMSA(ioData[1].treeBranches[ioData[1].treeBranches.length - 1]);

        for (var i = 0; i < names.length; i++) {
            var removedSequenceName = names[i];

            // [0] create copy of the alignment before a realignment
            var msa = startMsa.slice();  // shallow copy, because the elements itself are not modified
            var msaSequenceNames = startMsaSequenceNames.slice();

            // [1] remove sequence from MSA
            var mrData  // ([MSA], [removed sequence])
                = getMsaAndRemovedSequence(removedSequenceName, msa, msaSequenceNames);

            // [2] realign the removed sequence
            var msaRefined
                = getRealignment(mrData[0], msaSequenceNames, mrData[1], removedSequenceName, ioData[1].distanceMatrix, ioData[1].nameOfSequence);

            // [3] compute score of the MSA and refined MSA (replace startMsa with refinedMsa if [refinedMsa score] > [startMsa score])
            startMsa = getBetterMultiSequenceAlignment(startMsa, msaRefined);
        }

        storeAlignmentData(ioData[1].progressiveAlignment, startMsa, ioData[1].score,
            multiSequenceAlignmentInstance.getAffineSumOfPairsScore(inputData , outputData.refinedProgressiveAlignment));
        return [inputData, outputData];
    }

    /**
     * Initializes structs used in the algorithm.
     * Structs store information only if realignment is accepted (score increased).
     */
    function initializeStructs() {
        outputData.removedSequences = [];
        outputData.removedSequencesNames = [];

        outputData.remainingAlignment = [];
        outputData.remainingAlignmentName = [];

        outputData.guideAlignments = [];
        outputData.guideAlignmentsNames = [];

        outputData.acceptedRealignments = [];
        outputData.acceptedRealignmentsNames = [];
        outputData.acceptedRealignmentsScores = [];
    }

    /**
     * Computes Feng-Doolittle output.
     */
    function computeFengDoolittle(input) {
        fengDoolittleInstance.setIO(inputData, {});
        return fengDoolittleInstance.compute();
    }

    /**
     * Returns the names of sequences in order added to the MSA by doing an post-order-traversal.
     * @param tree - The phylogenetic tree from which you want get the representation.
     * @return {Array} - The names of the sequences in order they have been added to the MSA.
     */
    function getNamesInOrderAddedToMSA(tree) {
        var names = [];
        postOrder(tree, names);
        return names;
    }

    /**
     * Does a post-order traversal to get the sequence names.
     * @param node {Object} - The node from which on traversal takes place. At the beginning it is the root node.
     * @param names {Array} - The array which is filled with names.
     */
    function postOrder(node, names) {
        if (node === undefined)
            return;

        postOrder(node.leftChild, names);
        postOrder(node.rightChild, names);

        var isLeaf = node.leftChild === undefined && node.rightChild === undefined;

        if (isLeaf) names.push(node.name);
    }

    /**
     * Removes a sequence by its name from the MSA and then
     * @param removedSequenceName {string} - The name of the sequence which should be removed.
     * @param progressiveAlignment {Array} - The progressive alignment from which is removed.
     * @param msaSequenceNames {Array} - The names of sequences in the multi-sequence-alignment.
     * @return {[removedSequence, remainingAlignment]}
     */
    function getMsaAndRemovedSequence(removedSequenceName, progressiveAlignment, msaSequenceNames) {
        var removedSequence = getSequenceByName(progressiveAlignment, msaSequenceNames, removedSequenceName);
        var remainingAlignment = removeSequenceFromMSA(progressiveAlignment, msaSequenceNames, removedSequenceName);

        outputData.removedSequences.push(removedSequence);
        outputData.removedSequencesNames.push(removedSequenceName);

        outputData.remainingAlignment.push(remainingAlignment[0]);
        outputData.remainingAlignment.push(remainingAlignment[1]);  // push the name

        return [removedSequence, remainingAlignment];
    }

    /**
     * Returns the sequence from given multi-sequence-alignment.
     * @param multiSequenceAlignment {Array} - The multi-sequence-alignment from which a sequence should be returned.
     * @param msaSequenceNames {Array} - The names of sequences in the multi-sequence-alignment.
     * @param sequenceName {string} - The name of the sequence which should be returned from the multi-sequence-alignment.
     * @return {string} - Returns the sequence.
     */
    function getSequenceByName(multiSequenceAlignment, msaSequenceNames, sequenceName) {
        var indexInSequenceNames = msaSequenceNames.indexOf(sequenceName);
        return multiSequenceAlignment[indexInSequenceNames];
    }

    /**
     * Removes a sequence from the MSA by sequence-name.
     * @param multiSequenceAlignment {Array} - The multi-sequence-alignment from which a sequence should be removed.
     * @param msaSequenceNames {Array} - The names of sequences in the multiSequenceAlignment.
     * @param sequenceName {string} - The name of the sequence which should be removed from the multi-sequence-alignment.
     * @return [multiSequenceAlignment, msaSequencesNames] - The multi-sequence-alignment in which the sequence with the given name is removed.
     */
    function removeSequenceFromMSA(multiSequenceAlignment, msaSequenceNames, sequenceName) {
        var indexInSequenceNames = msaSequenceNames.indexOf(sequenceName);

        // remove sequenceName from msaSequenceNames and the associated sequence from the multiSequenceAlignment
        msaSequenceNames.splice(indexInSequenceNames, 1);
        multiSequenceAlignment.splice(indexInSequenceNames, 1);

        return [multiSequenceAlignment, msaSequenceNames];
    }

    /**
     * Returns the realignment of the removed sequence with the input MSA.
     * @param msa {Array} - The multi-sequence alignment to which the removed sequence should be realigned.
     * @param msaSequenceNames {Array} - The names of sequences in the multi-sequence-alignment.
     * @param removedSequence {string} - The removed sequence which should be realigned.
     * @param removedSequenceName {string} - The name of the sequence which is removed.
     * @param distanceMatrix {Object} - The distances which are to get the element with lowest distance to the removed sequence.
     * @param sequenceIdentificator {Object} - An object which identifies a sequence and returns its name.
     * @return {Array} - The MSA in which the removed sequence is realigned.
     */
    function getRealignment(msa, msaSequenceNames, removedSequence, removedSequenceName, distanceMatrix, sequenceIdentificator) {
        var realignment = [];

        if (inputData.iterativeRefinementSubalgorithm === ITERATIVE_REFINEMENT_STRATEGIES.MIN_DISTANCE_PAIR)
            realignment = getMinDistanceRealignment(msa, msaSequenceNames, removedSequence, removedSequenceName, distanceMatrix);
        else if (inputData.iterativeRefinementSubalgorithm === ITERATIVE_REFINEMENT_STRATEGIES.ONE_VS_ALL)
            realignment = getOneVsAllRealignment(msa, removedSequence, removedSequenceName, sequenceIdentificator);

        return realignment;
    }

    /**
     * Returns the realignment of the removed sequence
     * with the input MSA using the minimum distance approach (described in the algorithm HTML-file).
     * @param msa {Array} - The multi-sequence alignment to which the removed sequence should be realigned.
     * @param msaSequenceNames {Array} - The names of sequences in the multi-sequence-alignment.
     * @param removedSequence {string} - The removed sequence which should be realigned.
     * @param removedSequenceName {string} - The name of the sequence which is removed.
     * @param distanceMatrix {Object} - The distances which are to get the element with lowest distance to the removed sequence.
     * @return {Array} - The MSA in which the removed sequence is realigned.
     */
    function getMinDistanceRealignment(msa, msaSequenceNames, removedSequence, removedSequenceName, distanceMatrix) {
        // get nearest sequence
        var nearestElementName = getNearestElement(removedSequenceName, distanceMatrix);
        var nearestSequence = getSequenceByName(msa, msaSequenceNames, nearestElementName);

        // realign removed sequence with nearest sequence
        var cleanSequence = removedSequence.replace(MULTI_SYMBOLS.GAP, SYMBOLS.EMPTY);
        var realignment = getAffineRealignment(cleanSequence, nearestSequence);

        // only for visualization
        outputData.guideAlignments.push(realignment);
        outputData.guideAlignmentsNames.push(removedSequenceName + SYMBOLS.ALIGN + nearestElementName);

        // add realignment to MSA and possibly fill out with new gaps
        return multiSequenceAlignmentInstance.createGroup(msa, [cleanSequence], realignment);
    }

    /**
     * Given a name of an element, it is searched for nearest partner of this element.
     * @param name {string} - The name for which the nearest element should be found.
     * @param distanceMatrix {Object} - The distances which are to get the element with lowest distance to the removed sequence.
     * @return {string} - The nearest element from distance matrix.
     */
    function getNearestElement(name, distanceMatrix) {
        var keys = Object.keys(distanceMatrix);
        var names = getNamesFromKeys(keys);

        var minDistance = Number.POSITIVE_INFINITY;
        var minElement = SYMBOLS.EMPTY;

        for (var i = 0; i < names.length; i++) {
            if (names[i] !== name) {  // no diagonals
                var distance = distanceMatrix[[name, names[i]]];

                if (distance === undefined)
                    distance = distanceMatrix[[names[i], name]];

                if (distance < minDistance) {
                    minDistance = distance;
                    minElement = names[i];
                }
            }
        }

        return minElement;
    }

    /**
     * Returns the individual arguments of all given keys.
     * @example: A key has this form: "[a,b]" and the arguments are "a" and "b" are stored and later on returned with all other arguments.
     * @param keys {Object} - The keys from which the individual arguments are returned.
     * @return {Array} - The individual arguments of the keys.
     */
    function getNamesFromKeys(keys) {
        var names = [];

        for (var i = 0; i < keys.length; i++) {
            var key = keys[i].split(SYMBOLS.COMMA);

            if (names.indexOf(key[0]) === -1)
                names.push(key[0]);

            if (names.indexOf(key[1]) === -1)
                names.push(key[1]);
        }

        return names;
    }

    /**
     * Returns an affine realignment.
     * @param sequence1 {string} - The first string which should be aligned.
     * @param sequence2 {string} - The second string which should be aligned.
     * @return {[alignedSequenceB, matchOrMismatchString, alignedSequenceA]} - The alignment.
     */
    function getAffineRealignment(sequence1, sequence2) {
        inputData.sequenceA = sequence1;
        inputData.sequenceB = sequence2;

        gotohInstance.setIO(inputData, {});
        return gotohInstance.compute()[1].alignments[0];
    }

    /**
     * Returns the realignment of the removed sequence
     * with the input MSA using the minimum distance approach (described in the algorithm HTML-file).
     * @param msa {Array} - The multi-sequence alignment to which the removed sequence should be realigned.
     * @param removedSequence - The removed sequence which should be realigned.
     * @param removedSequenceName {string} - The name of the sequence which is removed.
     * @param sequenceIdentificator {Object} - An object which identifies a sequence and returns its name.
     * @return {Array} - The MSA in which the removed sequence is realigned.
     */
    function getOneVsAllRealignment(msa, removedSequence, removedSequenceName, sequenceIdentificator) {
        multiSequenceAlignmentInstance.setIO(inputData, outputData);

        // realign removed sequence with best sequence
        var cleanSequence = removedSequence.replace(MULTI_SYMBOLS.GAP, SYMBOLS.EMPTY);
        var bestAlignment = multiSequenceAlignmentInstance.getBestAlignment([cleanSequence], msa);

        var bestElementName
            = sequenceIdentificator[bestAlignment[2].replace(MULTI_SYMBOLS.NONE, SYMBOLS.EMPTY).replace(MULTI_SYMBOLS.GAP, SYMBOLS.EMPTY)];

        // only for visualization
        outputData.guideAlignments.push(bestAlignment);
        outputData.guideAlignmentsNames.push(removedSequenceName + SYMBOLS.ALIGN + bestElementName);

        return multiSequenceAlignmentInstance.createGroup(msa, cleanSequence, bestAlignment);
    }

    /**
     * Computes the Sum-Of-Pairs score of both input MSA and returns the one with the higher score.
     * @param msa {Array} - The original multi-sequence alignment.
     * @param refinedMsa {Array} - The refined multi-sequence alignment.
     * @return {Array} - The better MSA.
     */
    function getBetterMultiSequenceAlignment(msa, refinedMsa) {
        // compute affine scores of both MSA
        var msaScore = multiSequenceAlignmentInstance.getAffineSumOfPairsScore(inputData, msa);
        var refinedMsaScore =  multiSequenceAlignmentInstance.getAffineSumOfPairsScore(inputData, refinedMsa);

        // check which is higher and return the better MSA
        if (msaScore >= refinedMsaScore)
            return msa;
        // else if (refinedMsaScore > msaScore)

        outputData.acceptedRealignments.push(refinedMsa);
        //outputData.acceptedRealignmentsNames.push();
        outputData.acceptedRealignmentsScores.push(refinedMsaScore);

        return refinedMsa;
    }

    /**
     * Stores the alignment data from input.
     * @param msa {Array} - The original multi-sequence alignment.
     * @param refinedMsa {Array} - The refined multi-sequence alignment.
     * @param score {number} - The original multi-sequence alignment score.
     * @param refinedScore {number} - The refined multi-sequence alignment score.
     */
    function storeAlignmentData(msa, refinedMsa, score, refinedScore) {
        outputData.progressiveAlignment = progressiveAlignment;
        outputData.refinedProgressiveAlignment = refinedAlignment;

        outputData.score = score;
        outputData.refinedScore = refinedScore;
    }

    /**
     * Returns all algorithm output.
     * @return {Object} - Contains all output of the algorithm.
     */
    function getOutput() {
        return outputData;
    }

    /**
     * Sets the input and output of an algorithm.
     * @param input {Object} - Contains all input data.
     * @param output {Object} - Contains all output data.
     */
    function setIO(input, output) {
        inputData = input;
        outputData = output;
    }

    /**
     * Returns the superclass instance.
     * @return {Object} - Superclass instance.
     */
    function getSuperclass() {
        return multiSequenceAlignmentInstance;
    }
}());